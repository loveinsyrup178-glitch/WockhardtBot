/* ============================================================
   WOCKHARDTBOT — TEMP VC SYSTEM (FINAL CLEAN VERSION)
   Works on Discloud + GitHub + Node 18+
   ============================================================ */

console.log("💜 Wockhardt Temp VC Bot is starting...");

// ------------------------------------------------------------
// REQUIRED PACKAGES
// ------------------------------------------------------------
const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ------------------------------------------------------------
// CLIENT SETUP
// ------------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User],
});


// ------------------------------------------------------------
// TEMP VC SETTINGS — USE YOUR SERVER VALUES
// ------------------------------------------------------------

const SOURCE_VC = "1447154911627186206";        // Users click this VC
const TEMP_CATEGORY = "1447896116623310889";     // Temp VC category
const CONTROL_PANEL_CH = "1446420100151382131";  // Control panel channel

const TEMP_VC_NAME = "💜・{username}";
const DELETE_WHEN_EMPTY = true;

// Store created temp VCs
const tempCreated = new Map();


// ------------------------------------------------------------
// BOT ONLINE
// ------------------------------------------------------------
client.on("ready", () => {
    console.log(`💜 Logged in as ${client.user.tag}`);
});


// ------------------------------------------------------------
// CONTROL PANEL MESSAGE MAKER
// ------------------------------------------------------------
function makeControlPanel(member, channel) {
    return {
        embeds: [
            {
                title: "💜 Temp VC Control Panel",
                description:
                    `Your temporary VC has been created!\n\n` +
                    `**Channel:** ${channel}\n` +
                    `**Owner:** <@${member.id}>`,
                color: 0x9b4dff
            }
        ],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("vclock")
                    .setLabel("🔒 Lock")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("vcunlock")
                    .setLabel("🔓 Unlock")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("vclimit")
                    .setLabel("👥 Limit")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("vcrename")
                    .setLabel("✏️ Rename")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("vcclaim")
                    .setLabel("👑 Claim")
                    .setStyle(ButtonStyle.Success)
            )
        ]
    };
}


// ------------------------------------------------------------
// TEMP VC CREATION LOGIC
// ------------------------------------------------------------
client.on("voiceStateUpdate", async (oldState, newState) => {

    // User joins the source VC
    if (newState.channelId === SOURCE_VC && oldState.channelId !== SOURCE_VC) {

        const guild = newState.guild;
        const member = newState.member;

        const vcName = TEMP_VC_NAME.replace("{username}", member.user.username);

        const newVC = await guild.channels.create({
            name: vcName,
            type: 2, // Voice channel
            parent: TEMP_CATEGORY,
            permissionOverwrites: [
                { id: guild.id, allow: ["ViewChannel", "Connect"] },
                { id: member.id, allow: ["ManageChannels", "MuteMembers", "DeafenMembers"] }
            ]
        });

        // Move user into their VC
        await member.voice.setChannel(newVC).catch(() => {});

        // Store owner
        tempCreated.set(newVC.id, { owner: member.id, channel: newVC });

        // Send control panel
        const panelChannel = guild.channels.cache.get(CONTROL_PANEL_CH);
        if (panelChannel) panelChannel.send(makeControlPanel(member, newVC));

    }

    // Auto delete VC if empty
    if (oldState.channelId && tempCreated.has(oldState.channelId)) {

        const data = tempCreated.get(oldState.channelId);
        const channel = data.channel;

        if (DELETE_WHEN_EMPTY && channel.members.size === 0) {
            tempCreated.delete(channel.id);
            channel.delete().catch(() => {});
        }
    }
});


// ------------------------------------------------------------
// CONTROL PANEL BUTTON HANDLERS
// ------------------------------------------------------------
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voice = member.voice.channel;

    if (!voice || !tempCreated.has(voice.id))
        return interaction.reply({ content: "❌ You must be in your temp VC.", ephemeral: true });

    const data = tempCreated.get(voice.id);

    if (interaction.user.id !== data.owner)
        return interaction.reply({ content: "❌ Only the VC owner can use these controls.", ephemeral: true });

    // 🔒 LOCK
    if (interaction.customId === "vclock") {
        await voice.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: "🔒 Locked your VC.", ephemeral: true });
    }

    // 🔓 UNLOCK
    if (interaction.customId === "vcunlock") {
        await voice.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.reply({ content: "🔓 Unlocked your VC.", ephemeral: true });
    }

    // 👥 LIMIT
    if (interaction.customId === "vclimit") {
        await interaction.reply({ content: "Enter the new user limit (number).", ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 15000
        }).catch(() => null);

        if (!collected) return;

        const num = parseInt(collected.first().content);
        if (isNaN(num)) return collected.first().reply("❌ Invalid number.");

        await voice.setUserLimit(num);
        return collected.first().reply(`👥 Limit set to **${num}**`);
    }

    // ✏️ RENAME
    if (interaction.customId === "vcrename") {
        await interaction.reply({ content: "Send the new VC name.", ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: 15000
        }).catch(() => null);

        if (!collected) return;

        const newName = collected.first().content.slice(0, 40);
        await voice.setName(newName);

        return collected.first().reply(`✏️ Renamed to **${newName}**`);
    }

    // 👑 CLAIM OWNERSHIP
    if (interaction.customId === "vcclaim") {
        data.owner = interaction.user.id;
        tempCreated.set(voice.id, data);
        return interaction.reply({ content: "👑 You now own this VC.", ephemeral: true });
    }
});


// ------------------------------------------------------------
// BOT LOGIN
// ------------------------------------------------------------
client.login(process.env.TOKEN || "YOUR_BOT_TOKEN_HERE");
