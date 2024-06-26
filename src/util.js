/**
 * Our collection of utility functions, exported from the `/src/util.js` file
 * @module Utils
 */

/**
 * The `discord.js` Collection
 * @external DiscordCollection
 * @see {@link https://discord.js.org/#/docs/collection/main/class/Collection}
 */

// Importing from libraries
const {
  OAuth2Scopes, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { readdirSync, statSync } = require('fs');
const moment = require('moment');
const path = require('path');
const logger = require('@mirasaki/logger');
const colors = require('../config/colors.json');

// Import our constants
const {
  NS_IN_ONE_MS,
  NS_IN_ONE_SECOND,
  DEFAULT_DECIMAL_PRECISION,
  MS_IN_ONE_DAY,
  MS_IN_ONE_HOUR,
  MS_IN_ONE_MINUTE,
  MS_IN_ONE_SECOND,
  EMBED_DESCRIPTION_MAX_LENGTH,
  EMBED_MAX_CHARACTER_LENGTH
} = require('./constants');
const { validPermValues } = require('./handlers/permissions');

const exitNoConfig = () => {
  logger.syserr('Configuration file at "/config/config.js" doesn\'t exists, please refer to documentation, exiting...');
  process.exit(0);
};

// Resolve client configuration
let clientConfig;
try {
  clientConfig = require('../config/config.js');
}
catch {
  try {
    const modeArg = process.argv.find((e) => e.startsWith('mode'));
    const modeArgVal = modeArg.split('=')[1] ?? null;
    if (modeArgVal === 'testing') {
      clientConfig = require('../config/config.js');
      logger.debug('Using EXAMPLE CONFIG file, this is only supposed to happen in automated tests - please create a "/config/config.js" file and restart the bot');
    }
    else exitNoConfig();
  }
  catch {
    exitNoConfig();
  }
}

// Require config fail safe
if (!clientConfig) exitNoConfig();

/**
 * Transforms hex and rgb color input into integer color code
 * @method colorResolver
 * @param {string | Array<number>} [input] Hex color code or RGB array
 * @returns {number}
 */
const colorResolver = (input) => {
  // Return main bot color if no input is provided
  if (!input) return parseInt(colors.main.slice(1), 16);
  // Hex values
  if (typeof input === 'string') input = parseInt(input.slice(1), 16);
  // RGB values
  else input = (input[0] << 16) + (input[1] << 8) + input[2];
  // Returning our result
  return input;
};

/**
 * Get an array of (resolved) absolute file paths in the target directory,
 * Ignores files that start with a "." character
 * @param {string} requestedPath Absolute path to the directory
 * @param {Array<string>} [allowedExtensions=['.js', '.mjs', '.cjs']] Array of file extensions
 * @returns {Array<string>} Array of (resolved) absolute file paths
 */
const getFiles = (requestedPath, allowedExtensions = [
  '.js',
  '.mjs',
  '.cjs'
]) => {
  if (typeof allowedExtensions === 'string') allowedExtensions = [ allowedExtensions ];
  requestedPath ??= path.resolve(requestedPath);
  let res = [];

  for (let itemInDir of readdirSync(requestedPath)) {
    itemInDir = path.resolve(requestedPath, itemInDir);
    const stat = statSync(itemInDir);

    if (stat.isDirectory()) res = res.concat(getFiles(itemInDir, allowedExtensions));
    if (
      stat.isFile()
      && allowedExtensions.find((ext) => itemInDir.endsWith(ext))
      && !itemInDir.slice(
        itemInDir.lastIndexOf(path.sep) + 1, itemInDir.length
      ).startsWith('.')
    ) res.push(itemInDir);
  }
  return res;
};

/**
 * Utility function for getting the relative time string using moment
 * @param {Date} date The date to get the relative time from
 * @returns {string} Relative time from parameter Date
 */
const getRelativeTime = (date) => moment(date).fromNow();

/**
 * String converter: Mary Had A Little Lamb
 * @param {string} str Any string of characters
 * @returns {string} The string in title-case format
 */
const titleCase = (str) => {
  if (typeof str !== 'string') throw new TypeError('Expected type: String');
  str = str.toLowerCase().split(' ');
  for (let i = 0; i < str.length; i++) str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1);
  return str.join(' ');
};

/**
 * String converter: camelCaseString => ['camel', 'Case', 'String']
 * @param {string} str Any camelCase string
 * @param {string | null} joinCharacter If provided, joins the array output back together using the character
 * @returns {Array<string> | string} array of strings if joinCharacter is omitted, string if provided
 */
const splitCamelCaseStr = (str, joinCharacter = ' ') => {
  const arr = str.split(/ |\B(?=[A-Z])/);

  if (typeof joinCharacter === 'string') {
    return arr.join(joinCharacter);
  }
  return arr;
};

/**
 * String converter: Mary had a little lamb
 * @param {*} str The string to capitalize
 * @returns {string} Capitalized string
 */
const capitalizeString = (str) => `${ str.charAt(0).toUpperCase() }${ str.slice(1) }`;

/**
 * String converter: Parses a SNAKE_CASE_ARRAY to title-cased strings in an array
 * @param {Array<string>} arr Array of strings to convert
 * @returns {Array<string>} Array of title-cases SNAKE_CASE_ARRAY strings
 */
const parseSnakeCaseArray = (arr) => {
  return arr.map((str) => {
    str = str.toLowerCase().split(/[ _]+/);
    for (let i = 0; i < str.length; i++) str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1);
    return str.join(' ');
  });
};

/**
 * Get bot invite link, takes required permissions into consideration
 * @param {Client} client Our extended discord.js client
 * @returns {string} The invite link to add the bot to a server
 */
const getBotInviteLink = (client) => {
  const { commands } = client.container;
  const uniqueCombinedPermissions = [ ...new Set([].concat(...commands.map(((cmd) => cmd.clientPerms)))) ];
  uniqueCombinedPermissions.push(...client.container.config.permissionsBase);

  return client.generateInvite({
    scopes: [ OAuth2Scopes.ApplicationsCommands, OAuth2Scopes.Bot ],
    permissions: uniqueCombinedPermissions
      .map((rawPerm) => PermissionFlagsBits[rawPerm] ?? validPermValues.find((e) => e === rawPerm))
  });
};

/**
 * Make the client sleep/wait for a specific amount of time
 * @param {number} ms The amount of time in milliseconds to wait/sleep
 * @returns {Promise<void>} The promise to await
 */
// We don't need to access the return value here, EVER, so -
// eslint-disable-next-line no-promise-executor-return
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get runtime since process.hrtime.bigint() - NOT process.hrtime()
 * @param {bigint} hrtime Timestamp in nanosecond precision
 * @param {number | 2} decimalPrecision Amount of characters to display after decimal point
 * @returns {{ seconds: number, ms: number, ns: bigint }}
 */
const getRuntime = (hrtime, decimalPrecision = DEFAULT_DECIMAL_PRECISION) => {
  // Converting
  const inNS = process.hrtime.bigint() - hrtime;
  const nsNumber = Number(inNS);
  const inMS = (nsNumber / NS_IN_ONE_MS).toFixed(decimalPrecision);
  const InSeconds = (nsNumber / NS_IN_ONE_SECOND).toFixed(decimalPrecision);

  // Return the conversions
  return {
    seconds: InSeconds,
    ms: inMS,
    ns: inNS
  };
};

/**
 * Takes milliseconds as input and returns a string like: 2 days, 5 minutes, 21 seconds
 * @param {number} ms Time in milliseconds
 * @returns
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
const msToHumanReadableTime = (ms) => {
  const days = Math.floor(ms / MS_IN_ONE_DAY);
  const hours = Math.floor((ms % MS_IN_ONE_DAY) / MS_IN_ONE_HOUR);
  const minutes = Math.floor((ms % MS_IN_ONE_HOUR) / MS_IN_ONE_MINUTE);
  const seconds = Math.floor((ms % MS_IN_ONE_MINUTE) / MS_IN_ONE_SECOND);

  const parts = [];
  if (days > 0) parts.push(`${ days } day${ days === 1 ? '' : 's' }`);
  if (hours > 0) parts.push(`${ hours } hour${ hours === 1 ? '' : 's' }`);
  if (minutes > 0) parts.push(`${ minutes } minute${ minutes === 1 ? '' : 's' }`);
  if (seconds > 0) parts.push(`${ seconds } second${ seconds === 1 ? '' : 's' }`);

  if (parts.length === 0) return '0 seconds';
  else if (parts.length === 1) return parts[0];
  else if (parts.length === 2) return `${ parts[0] } and ${ parts[1] }`;
  else {
    const lastPart = parts.pop();
    const formattedParts = parts.join(', ');
    return `${ formattedParts }, and ${ lastPart }`;
  }
};

const doMaxLengthChunkReply = async (
  interaction,
  output,
  {
    title,
    titleIcon,
    color = colorResolver(),
    ephemeral = false
  }
// eslint-disable-next-line sonarjs/cognitive-complexity
) => {
  const { member } = interaction;

  // Single embed, short length
  if (output.length <= EMBED_DESCRIPTION_MAX_LENGTH) {
    interaction.editReply({ embeds: [
      {
        author: {
          name: title,
          iconURL: titleIcon
        },
        color,
        description: output,
        footer: { text: `Requested by: ${ member.displayName }` }
      }
    ] });
  }

  else {
    // Chunk reply according to max allowed length
    const lines = output.split('\n');
    const chunks = [ '' ];
    for (let i = 0; i < output.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const activeIndex = chunks.length - 1;
      const chunk = chunks[activeIndex];
      const newLength = chunk.length + (line.length + 2);
      if (newLength <= EMBED_DESCRIPTION_MAX_LENGTH) chunks[activeIndex] += `\n${ line }`;
      else chunks.push('');
    }

    // Check total length, max char count across ALL embeds
    // cant exceed EMBED_MAX_CHARACTER_LENGTH
    // Basically try 1 message, multiple embeds
    const totalLength = chunks.reduce((acc, chunk) => acc += chunk.length, 0);
    if (totalLength < EMBED_MAX_CHARACTER_LENGTH) interaction.editReply({ embeds: chunks.map((e, index) => {
      return ({
        author: index === 0
          ? {
            name: title,
            iconURL: titleIcon
          }
          : null,
        color,
        description: e,
        footer: index === chunks.length - 1
          ? { text: `Requested by: ${ member.displayName }` }
          : null
      });
    }) });

    // Too many, needs multiple messages
    else {
      // Initial overview embed of command
      await interaction.editReply({ embeds: [
        {
          author: {
            name: title,
            iconURL: titleIcon
          },
          color,
          description: chunks[0]
        }
      ] });

      // Send chunks of actual data
      for await (const chunk of chunks.slice(1, chunks.length)) {
        await interaction.followUp({
          ephemeral,
          embeds: [
            {
              color,
              description: chunk,
              footer: { text: chunks.indexOf(chunk) === (chunks.length - 1)
                ? `Requested by: ${ member.displayName }`
                : null }
            }
          ]
        });
      }
    }
  }
};

const debugLog = (ctx) => {
  if (process.env.DEBUG_ENABLED !== 'true') return;
  if (Array.isArray(ctx)) console.table(ctx);
  else if (typeof ctx === 'object') console.dir(ctx, { depth: Infinity });
  else logger.debug(ctx);
};

const replaceMessageTags = (str, tags = {}) => {
  for (const [ key, value ] of Object.entries(tags)) {
    str = str.replaceAll(`{{ ${ key } }}`, `${ value }`);
  }
  return str;
};

const extractDiscoHookData = (interaction, data) => {
  let jsonData = data;
  if (typeof data === 'string') {
    try {
      jsonData = JSON.parse(data);
    }
    catch {
      interaction.editReply('Unable to parse JSON content, please make sure you\'re using the correct export and try again - this command has been cancelled');
      return;
    }
  }
  const ctx = jsonData.backups[0]?.messages.map((e) => e.data ?? null);
  return ctx ?? null;
};

/**
 * Resolves human input (user prompts) to milliseconds
 * @param {string} input 1 day, 2 hours, 15 minutes, 30 seconds
 */
const humanTimeInputToMS = (input) => {
  const parts = input.split(/, | and /);
  let ms = 0;
  for (const part of parts) {
    const [ amount, unit ] = part.split(' ');
    if (unit === 'day' || unit === 'days') ms += amount * MS_IN_ONE_DAY;
    if (unit === 'hour' || unit === 'hours') ms += amount * MS_IN_ONE_HOUR;
    if (unit === 'minute' || unit === 'minutes') ms += amount * MS_IN_ONE_MINUTE;
    if (unit === 'second' || unit === 'seconds') ms += amount * MS_IN_ONE_SECOND;
  }
  return ms;
};

const resolveButtonColor = (color) => color === 'plurple'
  ? ButtonStyle.Primary
  : color === 'green'
    ? ButtonStyle.Success
    : color === 'grey'
      ? ButtonStyle.Secondary
      : color === 'red'
        ? ButtonStyle.Danger
        : ButtonStyle.Primary;

const resolveButtonName = ({ buttonEmoji, buttonText }) => `${ buttonEmoji ?? '' }${
  buttonEmoji ? ' ' : ''
}${ buttonText ?? '' }`;

const resolveRowsFromActions = (actions, customIdCb) => {
  // Construct button rows
  const rows = [];
  actions.forEach((action, index) => {
    // const rowIndex = Math.floor(
    //   actions.slice(0, index + 1).filter((e) => e !== null).length
    //   / 5
    // ) + actions.slice(0, index + 1).filter((e) => e === null).length;
    const rowIndex = Math.floor(index / 5) + actions.slice(0, index + 1).filter((e) => e === null).length;

    // Separator
    if (!action) {
      rows[rowIndex] = new ActionRowBuilder();
      return;
    }

    // 5 components per row OR null separator
    if (!rows[rowIndex]) rows[rowIndex] = new ActionRowBuilder();
    const row = rows[rowIndex];

    const {
      buttonText,
      buttonColor,
      buttonEmoji
    } = action;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ customIdCb(action) }`)
        .setLabel(resolveButtonName({
          buttonEmoji, buttonText
        }))
        .setStyle(resolveButtonColor(buttonColor))
    );
  });

  return rows;
};

const emojifyNumber = (number) => {
  const getEmoji = (numberStr) => {
    switch (numberStr) {
      case '0':
        return '0️⃣';
      case '1':
        return '1️⃣';
      case '2':
        return '2️⃣';
      case '3':
        return '3️⃣';
      case '4':
        return '4️⃣';
      case '5':
        return '5️⃣';
      case '6':
        return '6️⃣';
      case '7':
        return '7️⃣';
      case '8':
        return '8️⃣';
      case '9':
        return '9️⃣';
      default:
        return `${ numberStr }`;
    }
  };
  const numberString = `${ number }`;
  return numberString
    .split('')
    .map((e) => getEmoji(e))
    .join('');
};


module.exports = {
  clientConfig,
  splitCamelCaseStr,
  colorResolver,
  getFiles,
  getRelativeTime,
  titleCase,
  capitalizeString,
  parseSnakeCaseArray,
  getBotInviteLink,
  wait: sleep,
  sleep,
  getRuntime,
  msToHumanReadableTime,
  doMaxLengthChunkReply,
  debugLog,
  replaceMessageTags,
  extractDiscoHookData,
  humanTimeInputToMS,
  resolveButtonColor,
  resolveButtonName,
  resolveRowsFromActions,
  emojifyNumber
};
