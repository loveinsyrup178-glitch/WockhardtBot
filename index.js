// =====================================
// WOCKHARDT — ADVANCED TEMP VC SYSTEM
// LOCK • UNLOCK • LIMIT • RENAME • CLAIM
// =====================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, // needed for awaitMessages in panel channel
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// -------------------------------------
// YOUR SERVER SETTINGS (NEW SERVER)
// -------------------------------------
const CREATE_VC_ID = "1451498864350859264";  // join-to-create VOICE channel
const CATEGORY_ID  = "1411585822708469861";  // temp VC category

const TEMP_NAME = "💜・{username}";

// Track temporary VCs + their text panels
// key = vcId -> { owner, vcId, textId }
const tempVCs = new Map();

// -------------------------------------
// READY
// -------------------------------------
client.once("ready", () => {
  console.log(`💜 ${client.user.tag} is online`);
});

// -------------------------------------
// CONTROL PANEL MESSAGE (sent in temp text channel)
// -------------------------------------
function controlPanelMessage(member, vc) {
  return {
    content: `💜 **Temp VC created for <@${member.id}>**\n🔊 ${vc}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("limit").setLabel("👥 Limit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("claim").setLabel("👑 Claim").setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

// -------------------------------------
// CREATE TEMP VC + TEMP TEXT "VC CHAT" WHEN USER JOINS
// -------------------------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  // CREATE when user joins the create VC channel
  if (newState.channelId === CREATE_VC_ID) {
    const guild = newState.guild;
    const member = newState.member;

    try {
      const baseName = TEMP_NAME.replace("{username}", member.user.username);

      // Create the temp voice channel
      const newVC = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          {
            id: member.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
          },
        ],
      });

      // Create the private text channel for controls/chat (owner-only)
      const newText = await guild.channels.create({
        name: `${baseName}-chat`,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          // lock everyone out
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          // allow owner
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },
          // allow bot
          {
            id: guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
            ],
          },
        ],
      });

      // Move user into the VC
      await member.voice.setChannel(newVC).catch(() => {});

      // Save ownership
      tempVCs.set(newVC.id, { owner: member.id, vcId: newVC.id, textId: newText.id });

      // Send control panel inside the temp text channel
      await newText.send(controlPanelMessage(member, newVC));
    } catch (e) {
      console.log("❌ Temp VC create failed:", e?.message);
    }
  }

  // DELETE when empty
  if (oldState.channelId && tempVCs.has(oldState.channelId)) {
    const data = tempVCs.get(oldState.channelId);

    const guild = oldState.guild;
    const vc = guild.channels.cache.get(data.vcId);
    const txt = guild.channels.cache.get(data.textId);

    if (vc && vc.members.size === 0) {
      tempVCs.delete(vc.id);

      vc.delete().catch(() => {});
      if (txt) txt.delete().catch(() => {});
    }
  }
});

// -------------------------------------
// BUTTON INTERACTIONS (ONLY VC OWNER)
// -------------------------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  // Must be in a temp VC to use controls
  const member = interaction.guild.members.cache.get(interaction.user.id);
  const vc = member?.voice?.channel;
  if (!vc) return interaction.reply({ content: "❌ You must be in your temporary VC.", ephemeral: true });

  const data = tempVCs.get(vc.id);
  if (!data) return interaction.reply({ content: "❌ This is not a temp VC.", ephemeral: true });

  // Owner-only
  if (interaction.user.id !== data.owner) {
    return interaction.reply({ content: "❌ Only the VC owner can use these controls.", ephemeral: true });
  }

  // --- LOCK VC ---
  if (interaction.customId === "lock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false }).catch(() => {});
    return interaction.reply({ content: "🔒 The VC has been locked.", ephemeral: true });
  }

  // --- UNLOCK VC ---
  if (interaction.customId === "unlock") {
    await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true }).catch(() => {});
    return interaction.reply({ content: "🔓 The VC has been unlocked.", ephemeral: true });
  }

  // --- SET LIMIT ---
  if (interaction.customId === "limit") {
    await interaction.reply({ content: "Send the new user limit (number).", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 });

    if (!collected.size) return;
    const num = parseInt(collected.first().content, 10);
    if (isNaN(num)) return collected.first().reply("❌ Invalid number.");

    await vc.setUserLimit(num).catch(() => {});
    return collected.first().reply(`👥 Limit set to **${num}**.`);
  }

  // --- RENAME ---
  if (interaction.customId === "rename") {
    await interaction.reply({ content: "Send the new channel name.", ephemeral: true });

    const filter = (m) => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 15000 });

    if (!collected.size) return;
    const newName = collected.first().content.slice(0, 40);

    await vc.setName(newName).catch(() => {});
    return collected.first().reply(`✏️ Renamed to **${newName}**.`);
  }

  // --- CLAIM OWNERSHIP (owner can “re-claim” after transfer features later)
  if (interaction.customId === "claim") {
    data.owner = interaction.user.id;
    tempVCs.set(vc.id, data);
    return interaction.reply({ content: "👑 You now own this VC.", ephemeral: true });
  }
});

// -------------------------------------
// LOGIN
// -------------------------------------
client.login(process.env.TOKEN);
