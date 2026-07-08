/**
 * SMA Geo-Sync — keeps Google Ads location targeting in lockstep with
 * StaffMyAgency's active job inventory.
 *
 * What it does, once a day:
 *   1. Downloads the active-job-locations feed from the SMA site.
 *   2. For each campaign below, computes the set of radius targets it
 *      should have (one circle per city with at least one active job in
 *      that campaign's role families).
 *   3. Adds circles for new job locations, removes circles where all
 *      jobs have been filled, and pauses/resumes the campaign if its
 *      role family has zero jobs anywhere.
 *
 * Install: Google Ads > Tools & Settings > Bulk Actions > Scripts >
 * new script, paste this file, Authorize, then Schedule daily (early AM).
 *
 * Prerequisite: the feed endpoint (see CAMPAIGN-SETUP.md, "Job locations
 * feed"). Until the feed exists this script logs an error and changes
 * nothing.
 */

var CONFIG = {
  FEED_URL: 'https://staffmyagency.com/api/job-locations.json',

  // Campaign names must match Google Ads exactly. `roles` are the role
  // families from the feed counted toward that campaign's locations.
  CAMPAIGNS: [
    { name: 'SMA Jobs - Sales',   roles: ['SALES'] },
    { name: 'SMA Jobs - Service', roles: ['SERVICE'] },
    { name: 'SMA Jobs - Office',  roles: ['OFFICE', 'MANAGEMENT'] }
  ],

  RADIUS_MILES: 20,

  // Optional: send a change summary after each run. '' disables.
  NOTIFY_EMAIL: ''
};

function main() {
  var feed = fetchFeed();
  if (!feed) return; // fetch/parse failure already logged — change nothing

  var summary = [];

  CONFIG.CAMPAIGNS.forEach(function (cfg) {
    var campaign = getCampaign(cfg.name);
    if (!campaign) {
      summary.push(cfg.name + ': NOT FOUND in this account — skipped.');
      return;
    }

    var desired = desiredLocations(feed, cfg.roles);

    // Safety valve: an empty feed more likely means a broken feed than a
    // board with zero jobs nationwide. Pause instead of stripping targets,
    // so one bad night never destroys the targeting built up over time.
    if (desired.length === 0) {
      if (!campaign.isPaused()) {
        campaign.pause();
        summary.push(cfg.name + ': no active jobs for ' + cfg.roles.join('/') +
          ' — campaign PAUSED (targets left intact).');
      }
      return;
    }
    if (campaign.isPaused()) {
      campaign.enable();
      summary.push(cfg.name + ': jobs are back — campaign ENABLED.');
    }

    var result = syncProximities(campaign, desired);
    summary.push(cfg.name + ': ' + desired.length + ' locations (' +
      result.added + ' added, ' + result.removed + ' removed).');
  });

  var report = 'SMA Geo-Sync ' + feed.generated + '\n' + summary.join('\n');
  Logger.log(report);
  if (CONFIG.NOTIFY_EMAIL) {
    MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, 'SMA Geo-Sync run', report);
  }
}

function fetchFeed() {
  try {
    var response = UrlFetchApp.fetch(CONFIG.FEED_URL, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      Logger.log('Feed returned HTTP ' + response.getResponseCode() + ' — aborting, no changes made.');
      return null;
    }
    var feed = JSON.parse(response.getContentText());
    if (!feed.locations || !feed.locations.length) {
      Logger.log('Feed parsed but has no locations — aborting, no changes made.');
      return null;
    }
    return feed;
  } catch (e) {
    Logger.log('Feed fetch failed: ' + e + ' — aborting, no changes made.');
    return null;
  }
}

function getCampaign(name) {
  var it = AdsApp.campaigns().withCondition("Name = '" + name + "'").get();
  return it.hasNext() ? it.next() : null;
}

function desiredLocations(feed, roles) {
  return feed.locations.filter(function (loc) {
    var count = 0;
    roles.forEach(function (r) { count += (loc.jobs && loc.jobs[r]) || 0; });
    return count > 0 && typeof loc.lat === 'number' && typeof loc.lng === 'number';
  });
}

function syncProximities(campaign, desired) {
  // Key circles by rounded coordinates so float noise never causes
  // remove-and-readd churn. 3 decimals ≈ 110 m — plenty for a 20 mi circle.
  var key = function (lat, lng) {
    return lat.toFixed(3) + ',' + lng.toFixed(3);
  };

  var wanted = {};
  desired.forEach(function (loc) { wanted[key(loc.lat, loc.lng)] = loc; });

  var removed = 0;
  var existing = {};
  var it = campaign.targeting().targetedProximities().get();
  while (it.hasNext()) {
    var prox = it.next();
    var k = key(prox.getLatitude(), prox.getLongitude());
    if (wanted[k]) {
      existing[k] = true;
    } else {
      prox.remove();
      removed++;
    }
  }

  var added = 0;
  desired.forEach(function (loc) {
    var k = key(loc.lat, loc.lng);
    if (!existing[k]) {
      campaign.addProximity(loc.lat, loc.lng, CONFIG.RADIUS_MILES, 'MILES');
      added++;
    }
  });

  return { added: added, removed: removed };
}
