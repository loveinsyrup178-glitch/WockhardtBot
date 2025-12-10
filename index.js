const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Store Temporary VC Data
const tempVCs = new Map();

// ID of the channel users must click to create a temp VC
const CREATION_CHANNEL_ID = "1447154911627186206"; // <-- Change this

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} is online and ready!`);
});

// When a user joins the creation voice channel → create temp VC
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (newState.channelId === CREATION_CHANNEL_ID) {
        const guild = newState.guild;
        const user = newState.member;

        // Create new voice channel
        const newTempVC = await guild.channels.create({
            name: `${user.user.username}'s VC`,
            type: 2, // Voice
            parent: newState.channel.parentId,
            permissionOverwrites: [
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels]
                },
                {
                    id: guild.roles.everyone.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
                }
            ]
        });

        // Move user into their VC
        await newState.setChannel(newTempVC);

        // Save owner + channel
        tempVCs.set(newTempVC.id, {
            owner: user.id,
            id: newTempVC.id
        });
    }

    // Auto-delete empty temp VCs
    if (oldState.channelId && tempVCs.has(oldState.channelId)) {
        const tempData = tempVCs.get(oldState.channelId);
        const oldChannel = oldState.guild.channels.cache.get(tempData.id);

        if (oldChannel && oldChannel.members.size === 0) {
            await oldChannel.delete().catch(() => {});
            tempVCs.delete(oldState.channelId);
        }
    }
});

// Slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    // Lock VC
    if (cmd === "lock") {
        const vc = interaction.member.voice.channel;
        if (!vc) return interaction.reply({ content: "❌ You must be in your temp VC.", ephemeral: true });

        const tempData = tempVCs.get(vc.id);
        if (!tempData || tempData.owner !== interaction.user.id)
            return interaction.reply({ content: "❌ Only the VC owner can lock it.", ephemeral: true });

        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: false });

        return interaction.reply({ content: "🔒 Your VC is now **locked**." });
    }

    // Unlock VC
    if (cmd === "unlock") {
        const vc = interaction.member.voice.channel;
        if (!vc) return interaction.reply({ content: "❌ You must be in your temp VC.", ephemeral: true });

        const tempData = tempVCs.get(vc.id);
        if (!tempData || tempData.owner !== interaction.user.id)
            return interaction.reply({ content: "❌ Only the VC owner can unlock it.", ephemeral: true });

        await vc.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { Connect: true });

        return interaction.reply({ content: "🔓 Your VC is now **unlocked**." });
    }
});

// LOGIN USING TOKEN VARIABLE
client.login(process.env.TOKEN);

