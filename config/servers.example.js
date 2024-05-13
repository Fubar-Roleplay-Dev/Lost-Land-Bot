const { clientConfig } = require('../src/util');
const colors = require('../config/colors.json');

/**
 * For more information:
 * {@link https://wiki.mirasaki.dev/docs/cftools-discord-bot/server-configuration}
 */
module.exports = [
  {
    // Server data
    NAME: 'My Server 😎',
    CFTOOLS_SERVER_API_ID: 'YOUR_SERVER_API_ID',
    SERVER_IPV4: '0.0.0.0',
    SERVER_PORT: 2302,
    CFTOOLS_WEBHOOK_CHANNEL_ID: '1229556911301591050',
    CFTOOLS_WEBHOOK_USER_ID: '1229551051980411052',
    SERVER_INFO_CHANNEL_ID: '1229556911301591050',
    // Player count channels
    PLAYER_COUNT_CHANNEL_IDS: [ '1229558659139239986' ],
    PLAYER_COUNT_CHANNEL_TEMPLATE: 'Online: {{ playersOnline }}/{{ playersMax }} ({{ playersQueue }} Queued)',
    PLAYER_COUNT_SERVER_OFFLINE_MESSAGE: 'Server is offline',

    // Command config
    STATISTICS_INCLUDE_ZONES_HEATMAP: true,
    STATISTICS_KEEP_PUPPETEER_BROWSER_OPEN: true,
    STATISTICS_HIDE_PLAYER_NAME_HISTORY: true,
    SERVER_INFO_INCLUDE_MOD_LIST: true,

    // Live Discord > DayZ chat feed configuration
    USE_CHAT_FEED: true,
    CHAT_FEED_CHANNEL_IDS: [ '1229559203748909056' ],
    CHAT_FEED_REQUIRED_ROLE_IDS: [],
    CHAT_FEED_USE_DISCORD_PREFIX: true,
    CHAT_FEED_USE_DISPLAY_NAME: true,
    CHAT_FEED_MESSAGE_COOLDOWN: 2.5,
    CHAT_FEED_MAX_DISPLAY_NAME_LENGTH: 20,
    CHAT_FEED_DISCORD_TAGS: [
      {
        roleIds: [ clientConfig.permissions.ownerId ],
        displayTag: '[OWNER]',
        color: colors.red
      },
      {
        roleIds: clientConfig.permissions.administratorRoleIds,
        displayTag: '[ADMIN]',
        color: colors.red
      },
      {
        roleIds: clientConfig.permissions.moderatorRoleIds,
        displayTag: '[MOD]',
        color: colors.blue
      },
      {
        // Matches everyone - Doesn't use any color
        roleIds: [],
        displayTag: '[SURVIVOR]',
        enabled: false
      }
    ],

    // Teleport config
    USE_TELEPORT_LOCATIONS: true,
    TELEPORT_LOCATIONS_FILE_NAME: 'chernarus',

    // Watch list config
    WATCH_LIST_CHANNEL_ID: '1229559203748909056',
    WATCH_LIST_NOTIFICATION_ROLE_ID: '1112020551817502860',

    // Kill Feed config
    USE_KILL_FEED: true,
    KILL_FEED_DELAY: 5,
    KILL_FEED_CHANNEL_ID: '1229559203748909056',

    // Leaderboard config
    LEADERBOARD_DEFAULT_SORTING_STAT: 'OVERALL',
    LEADERBOARD_PLAYER_LIMIT: 25,
    LEADERBOARD_BLACKLIST: [
      '6284d7a30873a63f22e34f34',
      'CFTools IDs to exclude from the blacklist',
      'always use commas (,) at the end of the line EXCEPT THE LAST ONE > like so'
    ],
    LEADERBOARD_STATS: [
      'OVERALL',
      'KILLS',
      'KILL_DEATH_RATIO',
      'LONGEST_KILL',
      'PLAYTIME',
      'LONGEST_SHOT',
      'DEATHS',
      'SUICIDES'
    ],

    // Automatic Leaderboard
    AUTO_LB_ENABLED: false,
    AUTO_LB_CHANNEL_ID: '806479539110674472',
    AUTO_LB_INTERVAL_IN_MINUTES: 60,
    AUTO_LB_REMOVE_OLD_MESSAGES: true,
    AUTO_LB_PLAYER_LIMIT: 100,
    AUTO_LB_STAT: 'OVERALL'
  }
];
