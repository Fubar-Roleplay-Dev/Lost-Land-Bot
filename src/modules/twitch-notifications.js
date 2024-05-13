const {
  existsSync, writeFileSync, readFileSync, mkdirSync
} = require('fs');
const logger = require('@mirasaki/logger');
const moment = require('moment');
const { clientConfig, colorResolver } = require('../util');
const { EmbedBuilder } = require('discord.js');
const { twitchNotifications, twitchNotificationCheckEvery } = clientConfig;

const twitchLink = (channel) => `https://www.twitch.tv/${ channel }`;

const newTwitchStream = async (channel) => {
  const url = twitchLink(channel);
  const htmlBody = await (await fetch(url).catch(() => null))?.text() ?? null;
  const currStreamInfo = parseTwitchDataFromHTML(htmlBody, channel);
  if (!currStreamInfo) return null;

  // Declarations
  const jsonDataPath = `./data/twitch/${ channel }.json`;
  const hasInitialData = existsSync(jsonDataPath);
  const lastJSONStreamInfo = hasInitialData ? JSON.parse(readFileSync(jsonDataPath, 'utf-8')) : null;

  // We don't know previous data, so we can't determine
  // if anything is new, set initial and continue
  if (!hasInitialData || !lastJSONStreamInfo) {
    writeFileSync(jsonDataPath, JSON.stringify(currStreamInfo), { encoding: 'utf-8' });
    return null;
  }

  // Make sure we have a new stream
  if (lastJSONStreamInfo.streamLiveStartDate === currStreamInfo.streamLiveStartDate.toISOString()) return null;

  // We have a new live stream
  writeFileSync(jsonDataPath, JSON.stringify(currStreamInfo), { encoding: 'utf-8' });

  return currStreamInfo;
};

const parseTwitchDataFromHTML = (htmlBody, channel) => {
  let htmlData = htmlBody.split('<script type="application/ld+json">')[1];
  let htmlImage = '';
  if (htmlData) {
    htmlImage = htmlBody.split('content="https://static-cdn')[1];
    htmlImage = 'https://static-cdn' + htmlImage.split('"')[0];
    htmlData = htmlData.split('</script>')[0];
    htmlData = JSON.parse(htmlData);
    htmlData = htmlData[0];
  }

  const dataObject = htmlData;
  if (!dataObject) return null;
  const streamLiveStartDate = new Date(dataObject.uploadDate);
  const uptime = moment().diff(moment(streamLiveStartDate), 'minutes');

  return {
    streamName: channel,
    streamLink: twitchLink(channel),
    streamImage: htmlImage,
    streamIsLive: dataObject?.publication.isLiveBroadcast ?? false,
    streamLiveDescription: dataObject?.description ?? '',
    streamLivePreviewImage: dataObject?.thumbnailUrl[2] ?? '',
    streamLiveStartDate,
    uptime
  };
};


// eslint-disable-next-line sonarjs/cognitive-complexity
const runTwitchLiveFeed = async (client) => {
  // Make sure twitch data folder exists
  if (!existsSync('./data/twitch')) {
    logger.info('Creating twitch data folder');
    mkdirSync('./data/twitch', { recursive: true });
  }

  for await (const {
    twitchChannel,
    discordChannelId,
    notificationColor,
    notificationRoleIds
  } of twitchNotifications) {
    const newStream = await newTwitchStream(twitchChannel);
    if (!newStream) continue;

    // Resolve target channel
    const channel = await client.channels.fetch(discordChannelId).catch(() => null);
    if (!channel) {
      logger.syserr(`Failed to find Twitch Notification (${ twitchChannel }) channel ${ discordChannelId }`);
      continue;
    }

    const {
      streamName,
      streamLink,
      streamImage,
      streamIsLive,
      streamLiveDescription,
      streamLivePreviewImage,
      streamLiveStartDate,
      uptime
    } = newStream;

    if (!streamIsLive) continue;

    const humanReadableUptime = moment.duration(uptime, 'minutes').humanize();
    logger.info(`Twitch: ${ streamName } just went live: ${ streamLiveDescription }`);
    channel.send({
      content: `__**${ streamName }**__ just went [**live**](${ streamLink })! ${
        notificationRoleIds.length > 0 ? `<@&${ notificationRoleIds.join('>, <@&') }>` : ''
      }`,
      embeds: [
        new EmbedBuilder()
          .setImage(streamLivePreviewImage)
          .setThumbnail(streamImage)
          .setColor(colorResolver(notificationColor))
          .setAuthor({ name: streamName })
          .setURL(streamLink)
          .setTitle(streamLiveDescription)
          .setTimestamp(new Date(streamLiveStartDate))
          .setFooter({ text: humanReadableUptime })
      ]
    })
      .catch((err) => {
        logger.syserr(`Failed to send Twitch Notification (${ twitchChannel })`);
        logger.printErr(err);
      });
  }
};

const initializeTwitchFeed = (client) => {
  logger.info('Initializing Twitch Video Feed');
  runTwitchLiveFeed(client);
  setInterval(() => {
    logger.info('Checking for new Twitch Videos');
    runTwitchLiveFeed(client);
  }, twitchNotificationCheckEvery * 1000);
};

module.exports = {
  twitchLink,
  newTwitchStream,
  parseTwitchDataFromHTML,
  runTwitchLiveFeed,
  initializeTwitchFeed
};
