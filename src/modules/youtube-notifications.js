const {
  existsSync, writeFileSync, readFileSync, mkdirSync
} = require('fs');
const logger = require('@mirasaki/logger');
const rssParser = require('rss-parser');
const { clientConfig, colorResolver } = require('../util');
const { EmbedBuilder } = require('discord.js');
const { getGlobalCache } = require('../mongo/Global');

const parser = new rssParser();
const { youtubeNotifications, youtubeNotificationCheckEvery } = clientConfig;

const YOUTUBE_BASE_URL = 'https://youtube.com/feeds/videos.xml?channel_id=';

const checkNewVideo = async (ytChannelId) => {
  const globals = await getGlobalCache();
  const data = await parser.parseURL(`${ YOUTUBE_BASE_URL }${ ytChannelId }`)
    .catch((err) => {
      logger.syserr(`Failed to fetch YouTube channel ${ ytChannelId }`);
      logger.printErr(err);
    });

  if (!data) return null;

  // Declarations
  const jsonDataPath = `./data/youtube/${ ytChannelId }.json`;
  const hasInitialData = existsSync(jsonDataPath);
  const lastJSONVideo = hasInitialData ? JSON.parse(readFileSync(jsonDataPath, 'utf-8')) : null;

  // Get the last video from the feed
  const newLastVideo = data?.items[0];
  if (!newLastVideo) return null;

  // We don't know previous data, so we can't determine
  // if anything is new, set initial and return
  if (!hasInitialData || !lastJSONVideo) {
    writeFileSync(jsonDataPath, JSON.stringify(newLastVideo), { encoding: 'utf-8' });
    return null;
  }

  // Make sure we have a new video
  if (lastJSONVideo.id === newLastVideo.id) return null;

  // Make sure we didn't already process this video
  // Can happen when the RSS feed responses aren't synced
  if (globals.knownYoutubeVidIds.includes(newLastVideo.id)) return null;

  // We have a new video, save our references and return
  writeFileSync(jsonDataPath, JSON.stringify(newLastVideo), { encoding: 'utf-8' });
  globals.knownYoutubeVidIds.push(newLastVideo.id);
  await globals.save();
  return newLastVideo;
};

const runYTVideoFeed = async (client) => {
  // Make sure youtube data folder exists
  if (!existsSync('./data/youtube')) {
    logger.info('Creating youtube data folder');
    mkdirSync('./data/youtube', { recursive: true });
  }
  for await (const {
    youtubeChannelId,
    discordChannelId,
    notificationColor,
    notificationRoleIds
  } of youtubeNotifications) {
    const newVideo = await checkNewVideo(youtubeChannelId);
    if (!newVideo) continue;

    const channel = await client.channels.fetch(discordChannelId).catch(() => null);
    if (!channel) {
      logger.syserr(`Failed to find Youtube Notification (${ youtubeChannelId }) channel ${ discordChannelId }`);
      continue;
    }

    const {
      id,
      title,
      link,
      pubDate,
      author
    } = newVideo;

    logger.info(`New Youtube Video by ${ author }: ${ title }`);
    channel.send({
      content: `__**${ author }**__ has uploaded a [**new video**](${ link }) to Youtube! ${
        notificationRoleIds.length > 0 ? `<@&${ notificationRoleIds.join('>, <@&') }>` : ''
      }`,
      embeds: [
        new EmbedBuilder()
          .setImage(`https://img.youtube.com/vi/${ id.slice(9) }/maxresdefault.jpg`)
          .setColor(colorResolver(notificationColor))
          .setAuthor({ name: author })
          .setURL(link)
          .setTitle(title)
          .setTimestamp(new Date(pubDate))
          .setFooter({ text: id })
      ]
    })
      .catch((err) => {
        logger.syserr(`Failed to send Youtube Notification (${ youtubeChannelId })`);
        logger.printErr(err);
      });
  }
};

const initializeYouTubeFeed = (client) => {
  logger.info('Initializing Youtube Video Feed');
  runYTVideoFeed(client);
  setInterval(() => {
    logger.info('Checking for new Youtube Videos');
    runYTVideoFeed(client);
  }, youtubeNotificationCheckEvery * 1000);
};

module.exports = {
  YOUTUBE_BASE_URL,
  checkNewVideo,
  runYTVideoFeed,
  initializeYouTubeFeed
};
