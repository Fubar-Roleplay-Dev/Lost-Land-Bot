const { Game } = require('cftools-sdk');
const { cftClient, serverConfig } = require('./cftClient');
const { MS_IN_ONE_MINUTE } = require('../constants');
const { replaceMessageTags } = require('../util');
const logger = require('@mirasaki/logger');

const SERVER_STATUS_OFFLINE = 'offline';

// {{ playersOnline }} = Amount of players online
// {{ playersMax }} = Maximum amount of players
// {{ playersQueue }} - Amount of players in queue

const getPlayerCountStr = async ({
  SERVER_IPV4,
  SERVER_PORT,
  PLAYER_COUNT_CHANNEL_TEMPLATE
}) => {
  if (!SERVER_IPV4 || !SERVER_PORT) {
    logger.syserr('Missing SERVER_IPV4 and SERVER_PORT in #getPlayerCountStr');
    return null;
  }

  const res = await cftClient.getGameServerDetails({
    game: Game.DayZ,
    ip: SERVER_IPV4,
    port: SERVER_PORT
  });

  // Unavailable
  if (!res || res.online === false) return SERVER_STATUS_OFFLINE;

  return replaceMessageTags(PLAYER_COUNT_CHANNEL_TEMPLATE, {
    playersOnline: res.status?.players?.online ?? 0,
    playersMax: res.status?.players?.slots ?? 0,
    playersQueue: res.status?.players?.queue ?? 0
  });
};

const performPlayerCountUpdates = async (
  client,
  {
    SERVER_IPV4,
    SERVER_PORT,
    PLAYER_COUNT_CHANNEL_TEMPLATE,
    PLAYER_COUNT_SERVER_OFFLINE_MESSAGE,
    PLAYER_COUNT_CHANNEL_IDS
  }
) => {
  if (!SERVER_IPV4 || !SERVER_PORT) return;
  const str = await getPlayerCountStr({
    SERVER_IPV4,
    SERVER_PORT,
    PLAYER_COUNT_CHANNEL_TEMPLATE
  });
  if (!str) return;

  try {
    const statusStr
      = str === SERVER_STATUS_OFFLINE
        ? PLAYER_COUNT_SERVER_OFFLINE_MESSAGE ?? 'Server Offline'
        : str;
    for await (const id of PLAYER_COUNT_CHANNEL_IDS) {
      const channel = await client.channels.fetch(id).catch();
      if (!channel) continue;
      await channel.setName(statusStr);
    }
    logger.info(`Updated PlayerCount channels: ${ statusStr }`);
  }
  catch (err) {
    logger.syserr(
      'Error encountered while updating PlayerCount:'
    );
    logger.syserr(err);
  }
};

const playerCountCycle = async (client) => {
  logger.info('Initializing PlayerCount cycle');
  const perform = () => {
    for (const serverCfg of serverConfig) {
      if (!serverCfg.PLAYER_COUNT_CHANNEL_IDS?.length) continue;
      logger.info(`Updating PlayerCount for ${ serverCfg.NAME }`);
      performPlayerCountUpdates(client, {
        PLAYER_COUNT_CHANNEL_TEMPLATE: serverCfg.PLAYER_COUNT_CHANNEL_TEMPLATE,
        PLAYER_COUNT_SERVER_OFFLINE_MESSAGE: serverCfg.PLAYER_COUNT_SERVER_OFFLINE_MESSAGE,
        PLAYER_COUNT_CHANNEL_IDS: serverCfg.PLAYER_COUNT_CHANNEL_IDS,
        SERVER_IPV4: serverCfg.SERVER_IPV4,
        SERVER_PORT: serverCfg.SERVER_PORT
      });
    }
  };
  perform();
  // 2 updates per 10 minutes
  setInterval(() => {
    perform();
  }, MS_IN_ONE_MINUTE * 5);
};

module.exports = {
  SERVER_STATUS_OFFLINE,
  getPlayerCountStr,
  playerCountCycle
};
