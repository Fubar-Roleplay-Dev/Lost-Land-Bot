const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder
} = require('discord.js');
const { EMBED_FIELD_VALUE_MAX_LENGTH } = require('../constants');

const promptModal = async ({
  interaction,
  serverApiId,
  panelIndex,
  actionIndex,
  action,
  user,
  ticketPanel,
  onFinish,
  id = '@ticket-modal@',
  useDefaultId = true,
  returnModal = false
// eslint-disable-next-line sonarjs/cognitive-complexity
}) => {
  const { member } = interaction;
  const defaultId = `${ panelIndex }@${ actionIndex }${
    serverApiId
      ? `@${ serverApiId }`
      : ''
  }`;
  const modal = new ModalBuilder()
    .setCustomId(`${ id }${ useDefaultId ? defaultId : '' }`)
    .setTitle('Please fill in the following information');

  // Add form to modal - 5 MAX
  for await (const formEntry of action.formEntries.slice(0, 5)) {
    const formIndex = action.formEntries.indexOf(formEntry);
    const textInput = new TextInputBuilder()
      .setCustomId(`${ formIndex }`)
      .setLabel(formEntry.label)
      .setStyle(formEntry.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(formEntry.required ?? false);

    if (formEntry.placeholder) textInput.setPlaceholder(formEntry.placeholder);

    // Conditional length
    if (typeof formEntry.minLength !== 'undefined') textInput.setMinLength(formEntry.minLength);
    if (typeof formEntry.maxLength !== 'undefined') textInput.setMaxLength(formEntry.maxLength);

    // Make sure our response fits in the embed overview
    if (
      typeof formEntry.maxLength === 'undefined'
        || formEntry.maxLength === null
        || formEntry.maxLength > EMBED_FIELD_VALUE_MAX_LENGTH
    ) textInput.setMaxLength(EMBED_FIELD_VALUE_MAX_LENGTH);

    // Conditional dynamic values
    if (formEntry.isSteamId) {
      // Initial steamId population from backend/API
      if (!user.steamId && ticketPanel.preFetchSteam64FromApi) {
        try {
          const preFetchSteam64Url = ticketPanel.preFetchSteam64ApiURL.replace('{id}', member.user.id);
          let res = await fetch(preFetchSteam64Url, {
            headers: ticketPanel.preFetchSteam64ApiHeaders ?? {},
            method: ticketPanel.preFetchSteam64ApiMethod ?? 'GET'
          });
          res = await res.json();
          const steamIdFromBackend = res?.data?.SteamLink?.steamId ?? res?.data?._steam_link?.steam_id;
          if (steamIdFromBackend) {
            // eslint-disable-next-line require-atomic-updates
            user.steamId = steamIdFromBackend;
            await user.save();
          }
        }
        catch {
          // Continue silently
        }
      }
      // If we resolved the steamId from either source,
      // prefill the information
      if (user.steamId) textInput.setValue(user.steamId.replace(/\s/g, '1'));
    }

    // Push
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        textInput
      )
    );
  }

  if (returnModal) return modal;

  await interaction.showModal(modal);

  if (typeof onFinish === 'function') onFinish();
};
module.exports = { promptModal };
