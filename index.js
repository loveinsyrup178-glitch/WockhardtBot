// ===============================================
// WOCKHARDT — TEMP VC SYSTEM (DISOCLOUD SAFE)
// ===============================================

const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    Events
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// -----------------------------------------------
// SETTINGS
// -----------------------------------------------

// When users click THIS VC → create a private one:
const CREATION_VC = "1447154911627186206";

// Create each temp VC inside THIS CATEGORY:
const TEMP_CATEGORY = "1446462738770694296";

// What the temp VC is named:
const VC_NAME = "💜・{username}";

// Store created VC + owner
const tempVCs = new Map();

// -----------------------------------------------
// BOT READY
// -----------------------------------------------
client.once(Events.ClientReady, () => {
    console.log(`💜 ${client.user.tag} is online!`);
});

// -----------------------------------------------
// CREATE TEMP VC
// -----------------------------------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {

    // User joins the creation VC
    if (newState.channelId === CREATION_VC && oldState.channelId !== CREATION_VC) {
        const guild = newState.guild;
        const member = newState.member;

        const finalName = VC_NAME.replace("{username}", member.user.username);

        // Create new temp VC
        const newVC = await guild.channels.create({
            name: finalName,
            type: 2, // voice
            parent: TEMP_CATEGORY,
            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.ManageChannels
                    ]
                },
                {
                    id: guild.roles.everyone.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect
                    ]
                }
            ]
        });

        // Move user into their VC
        await newState.setChannel(newVC).catch(() => {});

        // Save ownership
        tempVCs.set(newVC.id, {
            owner: member.id,
            id: newVC.id
        });

        console.log(`Created VC for ${member.user.tag}`);
    }

    // -----------------------------------------------
    // DELETE TEMP VC WHEN EMPTY
    // -----------------------------------------------
    if (oldState.channelId && tempVCs.has(oldState.channelId)) {
        const data = tempVCs.get(oldState.channelId);
        const vc = oldState.guild.channels.cache.get(data.id);

        if (vc && vc.members.size === 0) {
            await vc.delete().catch(() => {});
            tempVCs.delete(oldState.channelId);
            console.log("Deleted empty VC");
        }
    }
});

// -----------------------------------------------
// LOGIN (Discloud uses ENV variable)
// -----------------------------------------------
client.login(process.env.TOKEN);
