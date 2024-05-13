const {
  colorResolver, msToHumanReadableTime, sleep
} = require('../util');
const colors = require('../../config/colors.json');
const emojis = require('../../config/emojis.json');
const { stripIndents } = require('common-tags');
const { MS_IN_ONE_MINUTE, MS_IN_ONE_SECOND } = require('../constants');
const { serverConfig, cftClient } = require('./cftClient');
const { Game } = require('cftools-sdk');
const { EmbedBuilder } = require('discord.js');

const resolveFlags = ({ attributes }) => {
  const flags = [];
  if (attributes?.dlc) flags.push(
    ...Object.entries(attributes.dlcs)
      .filter(([ k, v ]) => v === true)
      .map(([ k, v ]) => `dlc-${ k }`)
  );
  if (attributes.official) flags.push('official');
  if (attributes.modded) flags.push('modded');
  if (attributes.hive) flags.push(`hive-${ attributes.hive }`);
  if (attributes.experimental) flags.push('experimental');
  if (attributes.whitelist) flags.push('whitelist');
  return flags;
};

const calculateDayNightTime = (serverTimeAcceleration, serverNightTimeAcceleration) => {
  const minutesPerHour = 60;
  // Calculate the duration of a day in minutes
  const dayDuration = (12 / serverTimeAcceleration) * minutesPerHour;
  // Calculate the duration of a night in minutes
  const nightDuration = (dayDuration / serverNightTimeAcceleration);

  return {
    day: msToHumanReadableTime(dayDuration * MS_IN_ONE_MINUTE),
    night: msToHumanReadableTime(nightDuration * MS_IN_ONE_MINUTE)
  };
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const serverInfoOverviewEmbed = (data, flags, guild, descriptionPrefix = null) => {
  const { day, night } = calculateDayNightTime(
    (data.environment?.timeAcceleration?.general ?? 1),
    (data.environment?.timeAcceleration?.night ?? 1)
  );
  return {
    color: colorResolver(data.online ? colors.success : colors.error),
    author: {
      name: `#${ data.rank } | ` + data.name + (data.map ? ` (${ data.map })` : ''),
      icon_url: guild.iconURL({ dynamic: true })
    },
    description: stripIndents`
      ${ descriptionPrefix ? `${ descriptionPrefix }\n` : '' }
      **IP:** **\`${ data.host?.address ?? '0.0.0.0' }:${ data.host?.gamePort ?? '0000' }\`**
      **Time:** ${ data.environment?.time ?? 'Unknown' }
      **Location:** [${ data.geolocation.country?.code }] ${ data.geolocation?.country?.name ?? 'n/a' }
      **Perspective:** ${ data.environment?.perspectives?.thirdPersonPerspective ? 'First + Third' : 'First Online' }
      **Time Acceleration:**
      🌞 ${ day }
      🌗 ${ night }
      **Flags:** \`${ flags.join('`, `') || 'None' }\`
    `,
    fields: [
      {
        name: 'Players',
        value: stripIndents`
          Online: ${ data.status?.players?.online ?? 0 }
          Slots: ${ data.status?.players?.slots ?? 0 }
          Queue: ${ data.status?.players?.queue ?? 0 }
        `,
        inline: true
      },
      {
        name: 'Security',
        value: stripIndents`
          VAC: ${ (data.security?.vac ? emojis.success : emojis.error) ?? 'n/a' }
          BatllEye: ${ (data.security?.battleye ? emojis.success : emojis.error) ?? 'n/a' }
          Password-Protected: ${ (data.security?.password ? emojis.success : emojis.error) ?? 'n/a' }
        `,
        inline: true
      }
    ],
    footer: { text: `DayZ - ${ data.version }` }
  };
};

const runStickyServerInfoMessages = async (client) => {
  for await (const serverCfg of serverConfig) {
    const { SERVER_INFO_CHANNEL_ID } = serverCfg;
    const channel = client.channels.cache.get(SERVER_INFO_CHANNEL_ID);
    if (!channel) continue;

    // Fetch sessions
    let data;
    try {
      data = await cftClient.getGameServerDetails({
        game: Game.DayZ,
        ip: serverCfg.SERVER_IPV4,
        port: serverCfg.SERVER_PORT
      });
    }
    catch (err) {
      console.error('Error encountered while fetching server info for sticky module:');
      console.error(err);
      continue;
    }

    // Resolve flags
    const { attributes } = data;
    const flags = resolveFlags({ attributes });
    const embed = new EmbedBuilder(
      serverInfoOverviewEmbed(data, flags, channel.guild, stripIndents`
        ${ data.online ? '🟢' : '🔴' } **__Server is currently ${ data.online ? 'online' : 'offline' }__**
      `)
    );
    embed.setFooter({ text: `Last updated: ${ new Date().toLocaleString() }` });

    channel.messages.fetch({ limit: 1 }).then((messages) => {
      const lastMessage = messages.first();
      if (lastMessage && lastMessage.author.id === client.user.id) {
        lastMessage.edit({ embeds: [ embed ] });
      }
      else {
        channel.send({ embeds: [ embed ] });
      }
    });

    await sleep((Math.floor(Math.random() * 10) + 10) * MS_IN_ONE_SECOND);
  }
};

const initializeStickyServerInfoMessages = async (client) => {
  runStickyServerInfoMessages(client);
  setInterval(() => runStickyServerInfoMessages(client), 25 * MS_IN_ONE_SECOND);
};

module.exports = {
  resolveFlags,
  calculateDayNightTime,
  serverInfoOverviewEmbed,
  runStickyServerInfoMessages,
  initializeStickyServerInfoMessages
};
