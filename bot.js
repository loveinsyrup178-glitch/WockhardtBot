"""
Bleed Bot Recreation - Comprehensive Discord Bot
Implements all documented Bleed commands with exact syntax.
Requires: discord.py, aiohttp, Pillow, python-dotenv
Install: pip install discord.py aiohttp Pillow python-dotenv
"""

import discord
from discord.ext import commands, tasks
from discord import app_commands
import asyncio
import json
import os
import re
import random
import datetime
import aiohttp
import typing
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from typing import Optional, Union
from dotenv import load_dotenv

load_dotenv()

# ==================== CONFIGURATION ====================
DEFAULT_PREFIX = ","
TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.all()

class BleedBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix=self.get_prefix,
            intents=intents,
            help_command=None,
            case_insensitive=True
        )
        self.config = defaultdict(lambda: {"prefix": DEFAULT_PREFIX})
        self.cases = defaultdict(list)
        self.warns = defaultdict(lambda: defaultdict(list))
        self.mutes = defaultdict(dict)
        self.jails = defaultdict(dict)
        self.antinuke = defaultdict(lambda: {
            "enabled": False,
            "admins": [],
            "whitelist": [],
            "modules": {},
            "action_log": defaultdict(list)
        })
        self.levels = defaultdict(lambda: defaultdict(lambda: {"xp": 0, "level": 0, "messages": 0}))
        self.welcome_settings = defaultdict(dict)
        self.leave_settings = defaultdict(dict)
        self.boost_settings = defaultdict(dict)
        self.reaction_roles = defaultdict(dict)
        self.auto_responders = defaultdict(dict)
        self.giveaways = defaultdict(dict)
        self.snipe_data = defaultdict(lambda: {"deleted": deque(maxlen=50), "edited": deque(maxlen=50)})
        self.spotify_links = defaultdict(dict)
        self.lastfm_links = defaultdict(dict)
        self.bump_reminders = defaultdict(dict)
        self.counters = defaultdict(dict)
        self.staff_roles = defaultdict(set)
        self.invoke_messages = defaultdict(dict)
        self.fake_permissions = defaultdict(dict)
        self.automod_rules = defaultdict(list)
        self.load_data()

    def load_data(self):
        try:
            with open("bleed_data.json", "r") as f:
                data = json.load(f)
                self.config.update(data.get("config", {}))
                self.cases.update({int(k): v for k, v in data.get("cases", {}).items()})
                self.warns.update(data.get("warns", {}))
                self.antinuke.update(data.get("antinuke", {}))
                self.levels.update(data.get("levels", {}))
                self.welcome_settings.update(data.get("welcome", {}))
                self.leave_settings.update(data.get("leave", {}))
                self.boost_settings.update(data.get("boost", {}))
                self.reaction_roles.update(data.get("reaction_roles", {}))
                self.auto_responders.update(data.get("auto_responders", {}))
                self.spotify_links.update(data.get("spotify", {}))
                self.lastfm_links.update(data.get("lastfm", {}))
                self.bump_reminders.update(data.get("bump_reminders", {}))
                self.counters.update(data.get("counters", {}))
                self.staff_roles.update({int(k): set(v) for k, v in data.get("staff_roles", {}).items()})
                self.invoke_messages.update(data.get("invoke_messages", {}))
                self.fake_permissions.update(data.get("fake_permissions", {}))
        except FileNotFoundError:
            pass

    def save_data(self):
        data = {
            "config": dict(self.config),
            "cases": {str(k): v for k, v in self.cases.items()},
            "warns": dict(self.warns),
            "antinuke": dict(self.antinuke),
            "levels": dict(self.levels),
            "welcome": dict(self.welcome_settings),
            "leave": dict(self.leave_settings),
            "boost": dict(self.boost_settings),
            "reaction_roles": dict(self.reaction_roles),
            "auto_responders": dict(self.auto_responders),
            "spotify": dict(self.spotify_links),
            "lastfm": dict(self.lastfm_links),
            "bump_reminders": dict(self.bump_reminders),
            "counters": dict(self.counters),
            "staff_roles": {str(k): list(v) for k, v in self.staff_roles.items()},
            "invoke_messages": dict(self.invoke_messages),
            "fake_permissions": dict(self.fake_permissions),
        }
        with open("bleed_data.json", "w") as f:
            json.dump(data, f, indent=2, default=str)

    async def get_prefix(self, message):
        if not message.guild:
            return DEFAULT_PREFIX
        return self.config[str(message.guild.id)].get("prefix", DEFAULT_PREFIX)

    async def setup_hook(self):
        self.save_data_task.start()

    @tasks.loop(minutes=5)
    async def save_data_task(self):
        self.save_data()

    async def on_ready(self):
        print(f"Bleed Bot logged in as {self.user} ({self.user.id})")
        print(f"Connected to {len(self.guilds)} guilds")
        await self.change_presence(activity=discord.Activity(
            type=discord.ActivityType.watching, name="over your server"
        ))

bot = BleedBot()

# ==================== UTILITY FUNCTIONS ====================

def parse_duration(duration_str):
    """Parse duration string like 1d, 2h, 30m, 60s"""
    if not duration_str:
        return None
    total_seconds = 0
    matches = re.findall(r'(\d+)([dhms])', duration_str.lower())
    for amount, unit in matches:
        amount = int(amount)
        if unit == 'd':
            total_seconds += amount * 86400
        elif unit == 'h':
            total_seconds += amount * 3600
        elif unit == 'm':
            total_seconds += amount * 60
        elif unit == 's':
            total_seconds += amount
    return datetime.timedelta(seconds=total_seconds) if total_seconds > 0 else None

def format_duration(td):
    """Format timedelta to readable string"""
    if not td:
        return "Permanent"
    total_seconds = int(td.total_seconds())
    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    parts = []
    if days > 0: parts.append(f"{days}d")
    if hours > 0: parts.append(f"{hours}h")
    if minutes > 0: parts.append(f"{minutes}m")
    if seconds > 0: parts.append(f"{seconds}s")
    return " ".join(parts) if parts else "0s"

def create_case(guild_id, case_type, user_id, moderator_id, reason=None, duration=None):
    """Create a moderation case"""
    case_id = len(bot.cases[guild_id]) + 1
    case = {
        "id": case_id,
        "type": case_type,
        "user_id": user_id,
        "moderator_id": moderator_id,
        "reason": reason or "No reason provided",
        "duration": duration,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    bot.cases[guild_id].append(case)
    return case

async def send_invoke_message(ctx, command_name, user, reason=None, duration=None, case_id=None):
    """Send customized invoke message if configured"""
    guild_id = str(ctx.guild.id)
    invoke_config = bot.invoke_messages.get(guild_id, {}).get(command_name, {})

    if invoke_config.get("message"):
        msg = invoke_config["message"]
        msg = msg.replace("{user}", str(user))
        msg = msg.replace("{user.mention}", user.mention)
        msg = msg.replace("{user.name}", user.name)
        msg = msg.replace("{user.id}", str(user.id))
        msg = msg.replace("{reason}", reason or "No reason")
        msg = msg.replace("{duration}", duration or "Permanent")
        msg = msg.replace("{case.id}", str(case_id) if case_id else "N/A")
        msg = msg.replace("{moderator}", ctx.author.mention)
        msg = msg.replace("{guild.name}", ctx.guild.name)
        await ctx.send(msg)
    else:
        await ctx.send("👍")

    if invoke_config.get("dm"):
        dm_msg = invoke_config["dm"]
        dm_msg = dm_msg.replace("{user}", str(user))
        dm_msg = dm_msg.replace("{user.mention}", user.mention)
        dm_msg = dm_msg.replace("{user.name}", user.name)
        dm_msg = dm_msg.replace("{reason}", reason or "No reason")
        dm_msg = dm_msg.replace("{duration}", duration or "Permanent")
        dm_msg = dm_msg.replace("{case.id}", str(case_id) if case_id else "N/A")
        dm_msg = dm_msg.replace("{moderator}", str(ctx.author))
        dm_msg = dm_msg.replace("{guild.name}", ctx.guild.name)
        try:
            await user.send(dm_msg)
        except:
            pass

def has_staff_role():
    """Check if user has a bound staff role"""
    async def predicate(ctx):
        staff = bot.staff_roles.get(ctx.guild.id, set())
        if ctx.author.id == ctx.guild.owner_id:
            return True
        if any(role.id in staff for role in ctx.author.roles):
            return True
        if ctx.author.guild_permissions.administrator:
            return True
        raise commands.CheckFailure("You need a staff role or Administrator permission.")
    return commands.check(predicate)

def is_owner():
    """Check if user is server owner"""
    async def predicate(ctx):
        if ctx.author.id != ctx.guild.owner_id:
            raise commands.CheckFailure("Only the server owner can use this command.")
        return True
    return commands.check(predicate)

# ==================== SETUP COMMANDS ====================

@bot.command(name="setup")
@commands.has_permissions(administrator=True)
async def setup_cmd(ctx):
    """Create jail log channel and jail role"""
    guild = ctx.guild

    # Create jail role
    jail_role = discord.utils.get(guild.roles, name="Jailed")
    if not jail_role:
        jail_role = await guild.create_role(name="Jailed", color=discord.Color.dark_gray(), reason="Bleed setup")

    # Create jail channel
    jail_channel = discord.utils.get(guild.channels, name="jail")
    if not jail_channel:
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            jail_role: discord.PermissionOverwrite(read_messages=True, send_messages=True),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True)
        }
        jail_channel = await guild.create_text_channel("jail", overwrites=overwrites, reason="Bleed setup")

    # Create jail-log channel
    log_channel = discord.utils.get(guild.channels, name="jail-log")
    if not log_channel:
        log_channel = await guild.create_text_channel("jail-log", reason="Bleed setup")

    # Update permissions for all channels
    for channel in guild.channels:
        if channel != jail_channel and channel != log_channel:
            await channel.set_permissions(jail_role, read_messages=False, reason="Bleed setup")

    await ctx.send(f"✅ **Setup complete!**\n- Jail role: {jail_role.mention}\n- Jail channel: {jail_channel.mention}\n- Log channel: {log_channel.mention}")

@bot.command(name="setupmute")
@commands.has_permissions(administrator=True)
async def setupmute_cmd(ctx):
    """Create mute roles"""
    guild = ctx.guild

    roles_created = []

    muted = discord.utils.get(guild.roles, name="Muted")
    if not muted:
        muted = await guild.create_role(name="Muted", color=discord.Color.dark_gray(), reason="Bleed setupmute")
        roles_created.append("Muted")

    image_muted = discord.utils.get(guild.roles, name="Image Muted")
    if not image_muted:
        image_muted = await guild.create_role(name="Image Muted", color=discord.Color.dark_gray(), reason="Bleed setupmute")
        roles_created.append("Image Muted")

    reaction_muted = discord.utils.get(guild.roles, name="Reaction Muted")
    if not reaction_muted:
        reaction_muted = await guild.create_role(name="Reaction Muted", color=discord.Color.dark_gray(), reason="Bleed setupmute")
        roles_created.append("Reaction Muted")

    # Set permissions
    for channel in guild.channels:
        if isinstance(channel, discord.TextChannel):
            await channel.set_permissions(muted, send_messages=False, reason="Bleed setupmute")
            await channel.set_permissions(image_muted, attach_files=False, embed_links=False, reason="Bleed setupmute")
            await channel.set_permissions(reaction_muted, add_reactions=False, reason="Bleed setupmute")

    if roles_created:
        await ctx.send(f"✅ **Created roles:** {', '.join(roles_created)}")
    else:
        await ctx.send("✅ **All mute roles already exist.**")

@bot.command(name="prefix")
@commands.has_permissions(administrator=True)
async def prefix_cmd(ctx, action: str = None, new_prefix: str = None):
    """Change server prefix"""
    if action == "set" and new_prefix:
        bot.config[str(ctx.guild.id)]["prefix"] = new_prefix
        await ctx.send(f"✅ Prefix set to `{new_prefix}`")
    else:
        current = bot.config[str(ctx.guild.id)].get("prefix", DEFAULT_PREFIX)
        await ctx.send(f"Current prefix: `{current}`\nUsage: `{current}prefix set <symbol>`")

# ==================== BIND COMMANDS ====================

@bot.group(name="bind", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def bind_group(ctx):
    """Bind roles and settings"""
    await ctx.send("Usage: `bind staff @role`")

@bind_group.command(name="staff")
@commands.has_permissions(administrator=True)
async def bind_staff(ctx, role: discord.Role):
    """Bind/unbind a staff role"""
    guild_id = ctx.guild.id
    if role.id in bot.staff_roles[guild_id]:
        bot.staff_roles[guild_id].remove(role.id)
        await ctx.send(f"✅ {role.mention} is no longer a staff role")
    else:
        bot.staff_roles[guild_id].add(role.id)
        await ctx.send(f"✅ {role.mention} is now set as a staff role")

@bind_group.command(name="stafflist")
@commands.has_permissions(administrator=True)
async def bind_staff_list(ctx):
    """List bound staff roles"""
    guild_id = ctx.guild.id
    roles = bot.staff_roles.get(guild_id, set())
    if not roles:
        await ctx.send("No staff roles bound.")
        return
    role_mentions = [ctx.guild.get_role(rid).mention for rid in roles if ctx.guild.get_role(rid)]
    await ctx.send(f"**Staff Roles:** {', '.join(role_mentions) if role_mentions else 'None'}")

# ==================== MODERATION COMMANDS ====================

@bot.command(name="jail")
@commands.has_permissions(kick_members=True)
async def jail_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Jail a user"""
    jail_role = discord.utils.get(ctx.guild.roles, name="Jailed")
    if not jail_role:
        await ctx.send("❌ Jail role not found. Run `,setup` first.")
        return

    if user.top_role >= ctx.author.top_role and ctx.author.id != ctx.guild.owner_id:
        await ctx.send("❌ You cannot jail this user.")
        return

    # Store previous roles
    bot.jails[ctx.guild.id][user.id] = [role.id for role in user.roles if role != ctx.guild.default_role]

    # Remove all roles and add jail role
    await user.edit(roles=[jail_role], reason=f"Jailed by {ctx.author}: {reason}")

    case = create_case(ctx.guild.id, "jail", user.id, ctx.author.id, reason)
    await send_invoke_message(ctx, "jail", user, reason, case_id=case["id"])

    # Log to jail-log
    log_channel = discord.utils.get(ctx.guild.channels, name="jail-log")
    if log_channel:
        embed = discord.Embed(title=f"Case #{case['id']} | Jail", color=discord.Color.orange())
        embed.add_field(name="User", value=f"{user} ({user.id})")
        embed.add_field(name="Moderator", value=f"{ctx.author} ({ctx.author.id})")
        embed.add_field(name="Reason", value=reason or "No reason", inline=False)
        await log_channel.send(embed=embed)

@bot.command(name="unjail")
@commands.has_permissions(kick_members=True)
async def unjail_cmd(ctx, user: discord.Member):
    """Unjail a user"""
    jail_role = discord.utils.get(ctx.guild.roles, name="Jailed")
    if jail_role and jail_role in user.roles:
        await user.remove_roles(jail_role, reason=f"Unjailed by {ctx.author}")

    # Restore previous roles
    prev_roles = bot.jails.get(ctx.guild.id, {}).pop(user.id, [])
    roles_to_add = [ctx.guild.get_role(rid) for rid in prev_roles if ctx.guild.get_role(rid)]
    if roles_to_add:
        await user.add_roles(*roles_to_add, reason="Restoring roles after unjail")

    await ctx.send(f"✅ {user.mention} has been unjailed.")

@bot.command(name="mute")
@commands.has_permissions(moderate_members=True)
async def mute_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Mute a user"""
    muted_role = discord.utils.get(ctx.guild.roles, name="Muted")
    if not muted_role:
        await ctx.send("❌ Muted role not found. Run `,setupmute` first.")
        return

    await user.add_roles(muted_role, reason=f"Muted by {ctx.author}: {reason}")
    case = create_case(ctx.guild.id, "mute", user.id, ctx.author.id, reason)
    await send_invoke_message(ctx, "mute", user, reason, case_id=case["id"])

@bot.command(name="unmute")
@commands.has_permissions(moderate_members=True)
async def unmute_cmd(ctx, user: discord.Member):
    """Unmute a user"""
    muted_role = discord.utils.get(ctx.guild.roles, name="Muted")
    if muted_role and muted_role in user.roles:
        await user.remove_roles(muted_role, reason=f"Unmuted by {ctx.author}")
    await ctx.send(f"✅ {user.mention} has been unmuted.")

@bot.command(name="imagemute")
@commands.has_permissions(moderate_members=True)
async def imagemute_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Image mute a user"""
    role = discord.utils.get(ctx.guild.roles, name="Image Muted")
    if not role:
        await ctx.send("❌ Image Muted role not found. Run `,setupmute` first.")
        return
    await user.add_roles(role, reason=f"Image muted by {ctx.author}: {reason}")
    case = create_case(ctx.guild.id, "imagemute", user.id, ctx.author.id, reason)
    await send_invoke_message(ctx, "imagemute", user, reason, case_id=case["id"])

@bot.command(name="unimagemute")
@commands.has_permissions(moderate_members=True)
async def unimagemute_cmd(ctx, user: discord.Member):
    """Remove image mute"""
    role = discord.utils.get(ctx.guild.roles, name="Image Muted")
    if role and role in user.roles:
        await user.remove_roles(role, reason=f"Unimage muted by {ctx.author}")
    await ctx.send(f"✅ {user.mention} image mute removed.")

@bot.command(name="reactionmute")
@commands.has_permissions(moderate_members=True)
async def reactionmute_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Reaction mute a user"""
    role = discord.utils.get(ctx.guild.roles, name="Reaction Muted")
    if not role:
        await ctx.send("❌ Reaction Muted role not found. Run `,setupmute` first.")
        return
    await user.add_roles(role, reason=f"Reaction muted by {ctx.author}: {reason}")
    case = create_case(ctx.guild.id, "reactionmute", user.id, ctx.author.id, reason)
    await send_invoke_message(ctx, "reactionmute", user, reason, case_id=case["id"])

@bot.command(name="unreactionmute")
@commands.has_permissions(moderate_members=True)
async def unreactionmute_cmd(ctx, user: discord.Member):
    """Remove reaction mute"""
    role = discord.utils.get(ctx.guild.roles, name="Reaction Muted")
    if role and role in user.roles:
        await user.remove_roles(role, reason=f"Unreaction muted by {ctx.author}")
    await ctx.send(f"✅ {user.mention} reaction mute removed.")

@bot.command(name="warn")
@commands.has_permissions(moderate_members=True)
async def warn_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Warn a user"""
    guild_id = str(ctx.guild.id)
    user_id = str(user.id)
    warn_id = len(bot.warns[guild_id][user_id]) + 1

    warn = {
        "id": warn_id,
        "reason": reason or "No reason",
        "moderator": ctx.author.id,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    bot.warns[guild_id][user_id].append(warn)
    case = create_case(ctx.guild.id, "warn", user.id, ctx.author.id, reason)
    await send_invoke_message(ctx, "warn", user, reason, case_id=case["id"])

@bot.command(name="warns")
@commands.has_permissions(moderate_members=True)
async def warns_cmd(ctx, user: discord.Member):
    """View user warnings"""
    guild_id = str(ctx.guild.id)
    user_id = str(user.id)
    warnings = bot.warns.get(guild_id, {}).get(user_id, [])

    if not warnings:
        await ctx.send(f"{user.mention} has no warnings.")
        return

    embed = discord.Embed(title=f"Warnings for {user}", color=discord.Color.yellow())
    for warn in warnings[-10:]:
        mod = ctx.guild.get_member(warn["moderator"])
        embed.add_field(
            name=f"Warn #{warn['id']}",
            value=f"Reason: {warn['reason']}\nModerator: {mod.mention if mod else 'Unknown'}",
            inline=False
        )
    await ctx.send(embed=embed)

@bot.command(name="delwarn")
@commands.has_permissions(moderate_members=True)
async def delwarn_cmd(ctx, warn_id: int):
    """Delete a warning by ID"""
    guild_id = str(ctx.guild.id)
    found = False
    for user_id, warnings in bot.warns.get(guild_id, {}).items():
        for i, warn in enumerate(warnings):
            if warn["id"] == warn_id:
                del warnings[i]
                found = True
                await ctx.send(f"✅ Warning #{warn_id} deleted.")
                break
        if found:
            break
    if not found:
        await ctx.send("❌ Warning not found.")

@bot.command(name="clearwarns")
@commands.has_permissions(moderate_members=True)
async def clearwarns_cmd(ctx, user: discord.Member):
    """Clear all warnings for a user"""
    guild_id = str(ctx.guild.id)
    user_id = str(user.id)
    if user_id in bot.warns.get(guild_id, {}):
        bot.warns[guild_id][user_id] = []
    await ctx.send(f"✅ Cleared all warnings for {user.mention}.")

@bot.command(name="kick")
@commands.has_permissions(kick_members=True)
async def kick_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Kick a user"""
    if user.top_role >= ctx.author.top_role and ctx.author.id != ctx.guild.owner_id:
        await ctx.send("❌ You cannot kick this user.")
        return
    case = create_case(ctx.guild.id, "kick", user.id, ctx.author.id, reason)
    await user.kick(reason=f"Kicked by {ctx.author}: {reason}")
    await send_invoke_message(ctx, "kick", user, reason, case_id=case["id"])

@bot.command(name="ban")
@commands.has_permissions(ban_members=True)
async def ban_cmd(ctx, user: Union[discord.Member, discord.User], *, reason: str = None):
    """Ban a user"""
    if isinstance(user, discord.Member):
        if user.top_role >= ctx.author.top_role and ctx.author.id != ctx.guild.owner_id:
            await ctx.send("❌ You cannot ban this user.")
            return
    case = create_case(ctx.guild.id, "ban", user.id, ctx.author.id, reason)
    await ctx.guild.ban(user, reason=f"Banned by {ctx.author}: {reason}")
    await send_invoke_message(ctx, "ban", user, reason, case_id=case["id"])

@bot.command(name="tempban")
@commands.has_permissions(ban_members=True)
async def tempban_cmd(ctx, user: Union[discord.Member, discord.User], duration: str, *, reason: str = None):
    """Temporarily ban a user"""
    td = parse_duration(duration)
    if not td:
        await ctx.send("❌ Invalid duration. Use format: `1d`, `2h`, `30m`, `60s`")
        return

    case = create_case(ctx.guild.id, "tempban", user.id, ctx.author.id, reason, duration)
    await ctx.guild.ban(user, reason=f"Tempbanned by {ctx.author} for {duration}: {reason}")
    await send_invoke_message(ctx, "tempban", user, reason, duration, case_id=case["id"])

    # Schedule unban
    await asyncio.sleep(td.total_seconds())
    try:
        await ctx.guild.unban(user, reason="Tempban expired")
    except:
        pass

@bot.command(name="softban")
@commands.has_permissions(ban_members=True)
async def softban_cmd(ctx, user: discord.Member, *, reason: str = None):
    """Softban a user (ban and unban to purge messages)"""
    if user.top_role >= ctx.author.top_role and ctx.author.id != ctx.guild.owner_id:
        await ctx.send("❌ You cannot softban this user.")
        return
    case = create_case(ctx.guild.id, "softban", user.id, ctx.author.id, reason)
    await ctx.guild.ban(user, reason=f"Softbanned by {ctx.author}: {reason}", delete_message_days=7)
    await ctx.guild.unban(user, reason="Softban complete")
    await send_invoke_message(ctx, "softban", user, reason, case_id=case["id"])

@bot.command(name="hardban")
@commands.has_permissions(ban_members=True)
async def hardban_cmd(ctx, user: Union[discord.Member, discord.User], *, reason: str = None):
    """Hardban a user (ban and blacklist from rejoining)"""
    case = create_case(ctx.guild.id, "hardban", user.id, ctx.author.id, reason)
    await ctx.guild.ban(user, reason=f"Hardbanned by {ctx.author}: {reason}")
    await send_invoke_message(ctx, "hardban", user, reason, case_id=case["id"])

@bot.command(name="unban")
@commands.has_permissions(ban_members=True)
async def unban_cmd(ctx, user_id: int):
    """Unban a user by ID"""
    user = discord.Object(id=user_id)
    await ctx.guild.unban(user, reason=f"Unbanned by {ctx.author}")
    await ctx.send(f"✅ Unbanned user `{user_id}`.")

@bot.command(name="timeout")
@commands.has_permissions(moderate_members=True)
async def timeout_cmd(ctx, user: discord.Member, duration: str, *, reason: str = None):
    """Timeout a user"""
    td = parse_duration(duration)
    if not td:
        await ctx.send("❌ Invalid duration. Use format: `1d`, `2h`, `30m`, `60s`")
        return

    if td > datetime.timedelta(days=28):
        await ctx.send("❌ Timeout cannot exceed 28 days.")
        return

    await user.timeout(td, reason=f"Timed out by {ctx.author}: {reason}")
    case = create_case(ctx.guild.id, "timeout", user.id, ctx.author.id, reason, duration)
    await send_invoke_message(ctx, "timeout", user, reason, duration, case_id=case["id"])

@bot.command(name="untimeout")
@commands.has_permissions(moderate_members=True)
async def untimeout_cmd(ctx, user: discord.Member):
    """Remove timeout from a user"""
    await user.timeout(None, reason=f"Timeout removed by {ctx.author}")
    await ctx.send(f"✅ Removed timeout from {user.mention}.")

@bot.command(name="slowmode")
@commands.has_permissions(manage_channels=True)
async def slowmode_cmd(ctx, duration: str = "0"):
    """Set channel slowmode"""
    td = parse_duration(duration)
    seconds = int(td.total_seconds()) if td else int(duration)
    if seconds > 21600:
        await ctx.send("❌ Slowmode cannot exceed 6 hours.")
        return
    await ctx.channel.edit(slowmode_delay=seconds)
    if seconds == 0:
        await ctx.send("✅ Slowmode disabled.")
    else:
        await ctx.send(f"✅ Slowmode set to {format_duration(datetime.timedelta(seconds=seconds))}.")

@bot.command(name="stripstaff")
@commands.has_permissions(administrator=True)
async def stripstaff_cmd(ctx, user: discord.Member):
    """Strip all dangerous permissions from a user"""
    dangerous_perms = [
        "administrator", "ban_members", "kick_members", "manage_guild",
        "manage_channels", "manage_roles", "manage_webhooks", "manage_nicknames",
        "mention_everyone", "moderate_members", "manage_expressions", "view_audit_log"
    ]

    removed = []
    for role in user.roles:
        if role == ctx.guild.default_role:
            continue
        perms = role.permissions
        new_perms = perms
        had_dangerous = False
        for perm in dangerous_perms:
            if getattr(perms, perm):
                new_perms = new_perms._replace(**{perm: False})
                had_dangerous = True
        if had_dangerous:
            await role.edit(permissions=new_perms, reason=f"Stripstaff by {ctx.author}")
            removed.append(role.name)

    if removed:
        await ctx.send(f"✅ Stripped dangerous permissions from roles: {', '.join(removed)}")
    else:
        await ctx.send("✅ No dangerous permissions found to strip.")

@bot.command(name="cases")
@commands.has_permissions(moderate_members=True)
async def cases_cmd(ctx, user: discord.Member):
    """View moderation cases for a user"""
    guild_cases = bot.cases.get(ctx.guild.id, [])
    user_cases = [c for c in guild_cases if c["user_id"] == user.id]

    if not user_cases:
        await ctx.send(f"{user.mention} has no cases.")
        return

    embed = discord.Embed(title=f"Cases for {user}", color=discord.Color.blue())
    for case in user_cases[-10:]:
        mod = ctx.guild.get_member(case["moderator_id"])
        embed.add_field(
            name=f"Case #{case['id']} | {case['type'].upper()}",
            value=f"Reason: {case['reason']}\nModerator: {mod.mention if mod else 'Unknown'}\nDuration: {case.get('duration', 'N/A')}",
            inline=False
        )
    await ctx.send(embed=embed)

@bot.command(name="reason")
@commands.has_permissions(moderate_members=True)
async def reason_cmd(ctx, case_id: int, *, new_reason: str):
    """Edit the reason for a case"""
    guild_cases = bot.cases.get(ctx.guild.id, [])
    for case in guild_cases:
        if case["id"] == case_id:
            case["reason"] = new_reason
            await ctx.send(f"✅ Updated reason for Case #{case_id}.")
            return
    await ctx.send("❌ Case not found.")

@bot.command(name="invoke")
@commands.has_permissions(administrator=True)
async def invoke_cmd(ctx, command_name: str, action: str, *, message: str):
    """Customize moderation command responses"""
    valid_commands = ["jail", "kick", "ban", "tempban", "softban", "hardban", "timeout", "warn"]
    if command_name not in valid_commands:
        await ctx.send(f"❌ Invalid command. Valid: {', '.join(valid_commands)}")
        return

    if action not in ["message", "dm"]:
        await ctx.send("❌ Action must be `message` or `dm`.")
        return

    guild_id = str(ctx.guild.id)
    if guild_id not in bot.invoke_messages:
        bot.invoke_messages[guild_id] = {}
    if command_name not in bot.invoke_messages[guild_id]:
        bot.invoke_messages[guild_id][command_name] = {}

    bot.invoke_messages[guild_id][command_name][action] = message
    await ctx.send(f"✅ Set `{command_name}` {action} to: {message}")

# ==================== ANTINUKE COMMANDS ====================

@bot.group(name="antinuke", invoke_without_command=True)
@is_owner()
async def antinuke_group(ctx):
    """Antinuke configuration"""
    await ctx.send("Usage: `antinuke <admin|whitelist|config|list|admins|vanity|botadd|ban|kick|role|channel|emoji|webhook>`")

@antinuke_group.command(name="admin")
@is_owner()
async def antinuke_admin(ctx, user: discord.Member):
    """Grant/revoke antinuke admin"""
    guild_id = str(ctx.guild.id)
    admins = bot.antinuke[guild_id]["admins"]
    if user.id in admins:
        admins.remove(user.id)
        await ctx.send(f"✅ {user.mention} is no longer an antinuke admin.")
    else:
        admins.append(user.id)
        await ctx.send(f"✅ {user.mention} is now an antinuke admin.")

@antinuke_group.command(name="whitelist")
@is_owner()
async def antinuke_whitelist(ctx, user: Union[discord.Member, discord.User]):
    """Whitelist a user/bot from antinuke"""
    guild_id = str(ctx.guild.id)
    wl = bot.antinuke[guild_id]["whitelist"]
    if user.id in wl:
        wl.remove(user.id)
        await ctx.send(f"✅ {user.mention} is no longer whitelisted.")
    else:
        wl.append(user.id)
        await ctx.send(f"✅ {user.mention} is now whitelisted.")

@antinuke_group.command(name="config")
@is_owner()
async def antinuke_config(ctx):
    """View antinuke configuration"""
    guild_id = str(ctx.guild.id)
    config = bot.antinuke[guild_id]

    embed = discord.Embed(title="Antinuke Configuration", color=discord.Color.red())
    embed.add_field(name="Enabled", value="Yes" if config["enabled"] else "No")
    embed.add_field(name="Admins", value=len(config["admins"]))
    embed.add_field(name="Whitelisted", value=len(config["whitelist"]))
    embed.add_field(name="Modules", value=len(config["modules"]))
    await ctx.send(embed=embed)

@antinuke_group.command(name="list")
@is_owner()
async def antinuke_list(ctx):
    """List antinuke modules and whitelist"""
    guild_id = str(ctx.guild.id)
    config = bot.antinuke[guild_id]

    embed = discord.Embed(title="Antinuke Modules & Whitelist", color=discord.Color.red())
    for mod_name, mod_config in config["modules"].items():
        embed.add_field(
            name=mod_name,
            value=f"Threshold: {mod_config.get('threshold', 'N/A')}\nPunishment: {mod_config.get('do', 'N/A')}\nCommand: {mod_config.get('command', 'off')}",
            inline=False
        )
    await ctx.send(embed=embed)

@antinuke_group.command(name="admins")
@is_owner()
async def antinuke_admins(ctx):
    """List antinuke admins"""
    guild_id = str(ctx.guild.id)
    admins = bot.antinuke[guild_id]["admins"]
    mentions = [ctx.guild.get_member(uid).mention for uid in admins if ctx.guild.get_member(uid)]
    await ctx.send(f"**Antinuke Admins:** {', '.join(mentions) if mentions else 'None'}")

async def parse_antinuke_flags(ctx, args):
    """Parse antinuke command flags"""
    flags = {"threshold": 3, "do": "ban", "command": "off"}
    i = 0
    while i < len(args):
        if args[i] == "--threshold" and i + 1 < len(args):
            flags["threshold"] = int(args[i + 1])
            i += 2
        elif args[i] == "--do" and i + 1 < len(args):
            flags["do"] = args[i + 1]
            i += 2
        elif args[i] == "--command" and i + 1 < len(args):
            flags["command"] = args[i + 1]
            i += 2
        else:
            i += 1
    return flags

@antinuke_group.command(name="vanity")
@is_owner()
async def antinuke_vanity(ctx, status: str, *args):
    """Vanity URL protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["vanity"] = flags
        await ctx.send(f"✅ Enabled vanity antinuke. Punishment: {flags['do']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("vanity", None)
        await ctx.send("✅ Disabled vanity antinuke.")

@antinuke_group.command(name="botadd")
@is_owner()
async def antinuke_botadd(ctx, status: str):
    """Bot add protection"""
    guild_id = str(ctx.guild.id)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["botadd"] = {}
        await ctx.send("✅ Enabled botadd antinuke.")
    else:
        bot.antinuke[guild_id]["modules"].pop("botadd", None)
        await ctx.send("✅ Disabled botadd antinuke.")

@antinuke_group.command(name="ban")
@is_owner()
async def antinuke_ban(ctx, status: str, *args):
    """Mass ban protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["ban"] = flags
        await ctx.send(f"✅ Enabled ban antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}, Command: {flags['command']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("ban", None)
        await ctx.send("✅ Disabled ban antinuke.")

@antinuke_group.command(name="kick")
@is_owner()
async def antinuke_kick(ctx, status: str, *args):
    """Mass kick protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["kick"] = flags
        await ctx.send(f"✅ Enabled kick antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}, Command: {flags['command']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("kick", None)
        await ctx.send("✅ Disabled kick antinuke.")

@antinuke_group.command(name="role")
@is_owner()
async def antinuke_role(ctx, status: str, *args):
    """Mass role deletion protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["role"] = flags
        await ctx.send(f"✅ Enabled role antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}, Command: {flags['command']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("role", None)
        await ctx.send("✅ Disabled role antinuke.")

@antinuke_group.command(name="channel")
@is_owner()
async def antinuke_channel(ctx, status: str, *args):
    """Mass channel create/delete protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["channel"] = flags
        await ctx.send(f"✅ Enabled channel antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("channel", None)
        await ctx.send("✅ Disabled channel antinuke.")

@antinuke_group.command(name="emoji")
@is_owner()
async def antinuke_emoji(ctx, status: str, *args):
    """Mass emoji deletion protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["emoji"] = flags
        await ctx.send(f"✅ Enabled emoji antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("emoji", None)
        await ctx.send("✅ Disabled emoji antinuke.")

@antinuke_group.command(name="webhook")
@is_owner()
async def antinuke_webhook(ctx, status: str, *args):
    """Mass webhook creation protection"""
    guild_id = str(ctx.guild.id)
    flags = await parse_antinuke_flags(ctx, args)
    if status.lower() == "on":
        bot.antinuke[guild_id]["modules"]["webhook"] = flags
        await ctx.send(f"✅ Enabled webhook antinuke. Threshold: {flags['threshold']}, Punishment: {flags['do']}.")
    else:
        bot.antinuke[guild_id]["modules"].pop("webhook", None)
        await ctx.send("✅ Disabled webhook antinuke.")

# ==================== WELCOME/LEAVE COMMANDS ====================

@bot.group(name="welcome", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def welcome_group(ctx):
    """Welcome message configuration"""
    await ctx.send("Usage: `welcome channel #channel | welcome message <text> | welcome embed <json>`")

@welcome_group.command(name="channel")
@commands.has_permissions(administrator=True)
async def welcome_channel(ctx, channel: discord.TextChannel):
    """Set welcome channel"""
    bot.welcome_settings[str(ctx.guild.id)]["channel"] = channel.id
    await ctx.send(f"✅ Welcome channel set to {channel.mention}")

@welcome_group.command(name="message")
@commands.has_permissions(administrator=True)
async def welcome_message(ctx, *, message: str):
    """Set welcome message"""
    bot.welcome_settings[str(ctx.guild.id)]["message"] = message
    await ctx.send("✅ Welcome message set.")

@welcome_group.command(name="embed")
@commands.has_permissions(administrator=True)
async def welcome_embed(ctx, *, json_code: str):
    """Set welcome embed (JSON format)"""
    try:
        data = json.loads(json_code)
        bot.welcome_settings[str(ctx.guild.id)]["embed"] = data
        await ctx.send("✅ Welcome embed set.")
    except json.JSONDecodeError:
        await ctx.send("❌ Invalid JSON.")

@bot.group(name="leave", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def leave_group(ctx):
    """Leave message configuration"""
    await ctx.send("Usage: `leave channel #channel | leave message <text> | leave embed <json>`")

@leave_group.command(name="channel")
@commands.has_permissions(administrator=True)
async def leave_channel(ctx, channel: discord.TextChannel):
    """Set leave channel"""
    bot.leave_settings[str(ctx.guild.id)]["channel"] = channel.id
    await ctx.send(f"✅ Leave channel set to {channel.mention}")

@leave_group.command(name="message")
@commands.has_permissions(administrator=True)
async def leave_message(ctx, *, message: str):
    """Set leave message"""
    bot.leave_settings[str(ctx.guild.id)]["message"] = message
    await ctx.send("✅ Leave message set.")

@bot.event
async def on_member_join(member):
    """Handle welcome messages"""
    guild_id = str(member.guild.id)
    settings = bot.welcome_settings.get(guild_id, {})
    if not settings:
        return

    channel = member.guild.get_channel(settings.get("channel", 0))
    if not channel:
        return

    message = settings.get("message", "Welcome {user.mention} to {guild.name}!")
    message = message.replace("{user}", str(member))
    message = message.replace("{user.mention}", member.mention)
    message = message.replace("{user.name}", member.name)
    message = message.replace("{user.id}", str(member.id))
    message = message.replace("{user.avatar}", str(member.display_avatar.url))
    message = message.replace("{guild.name}", member.guild.name)
    message = message.replace("{guild.id}", str(member.guild.id))
    message = message.replace("{guild.member_count}", str(member.guild.member_count))
    message = message.replace("{guild.icon}", str(member.guild.icon.url) if member.guild.icon else "")

    embed_data = settings.get("embed")
    if embed_data:
        embed = discord.Embed.from_dict(embed_data)
        await channel.send(message, embed=embed)
    else:
        await channel.send(message)

@bot.event
async def on_member_remove(member):
    """Handle leave messages"""
    guild_id = str(member.guild.id)
    settings = bot.leave_settings.get(guild_id, {})
    if not settings:
        return

    channel = member.guild.get_channel(settings.get("channel", 0))
    if not channel:
        return

    message = settings.get("message", "{user.name} has left {guild.name}.")
    message = message.replace("{user}", str(member))
    message = message.replace("{user.mention}", member.mention)
    message = message.replace("{user.name}", member.name)
    message = message.replace("{user.id}", str(member.id))
    message = message.replace("{guild.name}", member.guild.name)
    message = message.replace("{guild.member_count}", str(member.guild.member_count))

    await channel.send(message)

# ==================== REACTION ROLES ====================

@bot.group(name="reactionrole", invoke_without_command=True, aliases=["rr"])
@commands.has_permissions(administrator=True)
async def reactionrole_group(ctx):
    """Reaction role configuration"""
    await ctx.send("Usage: `reactionrole add <message_id> <emoji> @role | reactionrole remove <message_id> <emoji>`")

@reactionrole_group.command(name="add")
@commands.has_permissions(administrator=True)
async def rr_add(ctx, message_id: int, emoji: str, role: discord.Role):
    """Add a reaction role"""
    guild_id = str(ctx.guild.id)
    if guild_id not in bot.reaction_roles:
        bot.reaction_roles[guild_id] = {}

    msg_key = str(message_id)
    if msg_key not in bot.reaction_roles[guild_id]:
        bot.reaction_roles[guild_id][msg_key] = {}

    bot.reaction_roles[guild_id][msg_key][emoji] = role.id

    # Add reaction to message
    channel = ctx.channel
    try:
        msg = await channel.fetch_message(message_id)
        await msg.add_reaction(emoji)
    except:
        pass

    await ctx.send(f"✅ Added reaction role: {emoji} -> {role.mention}")

@reactionrole_group.command(name="remove")
@commands.has_permissions(administrator=True)
async def rr_remove(ctx, message_id: int, emoji: str):
    """Remove a reaction role"""
    guild_id = str(ctx.guild.id)
    msg_key = str(message_id)

    if guild_id in bot.reaction_roles and msg_key in bot.reaction_roles[guild_id]:
        bot.reaction_roles[guild_id][msg_key].pop(emoji, None)
        await ctx.send("✅ Reaction role removed.")
    else:
        await ctx.send("❌ Reaction role not found.")

@bot.event
async def on_raw_reaction_add(payload):
    """Handle reaction role additions"""
    if payload.user_id == bot.user.id:
        return

    guild_id = str(payload.guild_id)
    msg_key = str(payload.message_id)
    emoji = str(payload.emoji)

    config = bot.reaction_roles.get(guild_id, {}).get(msg_key, {})
    role_id = config.get(emoji)

    if role_id:
        guild = bot.get_guild(payload.guild_id)
        member = guild.get_member(payload.user_id)
        role = guild.get_role(role_id)
        if member and role:
            await member.add_roles(role, reason="Reaction role")

@bot.event
async def on_raw_reaction_remove(payload):
    """Handle reaction role removals"""
    guild_id = str(payload.guild_id)
    msg_key = str(payload.message_id)
    emoji = str(payload.emoji)

    config = bot.reaction_roles.get(guild_id, {}).get(msg_key, {})
    role_id = config.get(emoji)

    if role_id:
        guild = bot.get_guild(payload.guild_id)
        member = guild.get_member(payload.user_id)
        role = guild.get_role(role_id)
        if member and role:
            await member.remove_roles(role, reason="Reaction role")

# ==================== LEVELS SYSTEM ====================

@bot.command(name="level", aliases=["rank", "lvl"])
async def level_cmd(ctx, user: discord.Member = None):
    """View your or another user's level"""
    user = user or ctx.author
    guild_id = str(ctx.guild.id)
    user_id = str(user.id)
    data = bot.levels[guild_id][user_id]

    embed = discord.Embed(title=f"Level for {user.name}", color=discord.Color.green())
    embed.add_field(name="Level", value=data["level"])
    embed.add_field(name="XP", value=data["xp"])
    embed.add_field(name="Messages", value=data["messages"])
    await ctx.send(embed=embed)

@bot.command(name="leaderboard", aliases=["lb", "levels"])
async def leaderboard_cmd(ctx):
    """View server level leaderboard"""
    guild_id = str(ctx.guild.id)
    sorted_users = sorted(
        bot.levels[guild_id].items(),
        key=lambda x: (x[1]["level"], x[1]["xp"]),
        reverse=True
    )[:10]

    embed = discord.Embed(title="Level Leaderboard", color=discord.Color.gold())
    for i, (uid, data) in enumerate(sorted_users, 1):
        member = ctx.guild.get_member(int(uid))
        name = member.name if member else f"User {uid}"
        embed.add_field(name=f"#{i} {name}", value=f"Level {data['level']} | {data['xp']} XP", inline=False)
    await ctx.send(embed=embed)

@bot.command(name="levelreward", aliases=["levelrewards"])
@commands.has_permissions(administrator=True)
async def levelreward_cmd(ctx, level: int, role: discord.Role = None):
    """Set level rewards"""
    guild_id = str(ctx.guild.id)
    if "rewards" not in bot.levels[guild_id]:
        bot.levels[guild_id]["rewards"] = {}

    if role:
        bot.levels[guild_id]["rewards"][str(level)] = role.id
        await ctx.send(f"✅ Set level {level} reward to {role.mention}")
    else:
        bot.levels[guild_id]["rewards"].pop(str(level), None)
        await ctx.send(f"✅ Removed level {level} reward.")

@bot.event
async def on_message(message):
    if message.author.bot or not message.guild:
        return

    # Level system
    guild_id = str(message.guild.id)
    user_id = str(message.author.id)

    bot.levels[guild_id][user_id]["messages"] += 1
    bot.levels[guild_id][user_id]["xp"] += random.randint(15, 25)

    # Check level up
    current_xp = bot.levels[guild_id][user_id]["xp"]
    current_level = bot.levels[guild_id][user_id]["level"]
    xp_needed = (current_level + 1) * 100

    if current_xp >= xp_needed:
        bot.levels[guild_id][user_id]["level"] += 1
        bot.levels[guild_id][user_id]["xp"] = 0

        # Check for level reward
        rewards = bot.levels[guild_id].get("rewards", {})
        role_id = rewards.get(str(current_level + 1))
        if role_id:
            role = message.guild.get_role(role_id)
            if role:
                await message.author.add_roles(role, reason="Level reward")

        await message.channel.send(f"🎉 {message.author.mention} leveled up to **Level {current_level + 1}**!")

    await bot.process_commands(message)

# ==================== SNIPE COMMANDS ====================

@bot.command(name="snipe")
async def snipe_cmd(ctx):
    """Recover last deleted message"""
    guild_id = str(ctx.guild.id)
    channel_id = str(ctx.channel.id)
    key = f"{guild_id}:{channel_id}"

    deleted = bot.snipe_data[key]["deleted"]
    if not deleted:
        await ctx.send("❌ Nothing to snipe.")
        return

    msg = deleted[-1]
    embed = discord.Embed(description=msg["content"], color=discord.Color.red(), timestamp=msg["time"])
    embed.set_author(name=msg["author"], icon_url=msg["avatar"])
    await ctx.send(embed=embed)

@bot.command(name="esnipe")
async def esnipe_cmd(ctx):
    """Recover last edited message"""
    guild_id = str(ctx.guild.id)
    channel_id = str(ctx.channel.id)
    key = f"{guild_id}:{channel_id}"

    edited = bot.snipe_data[key]["edited"]
    if not edited:
        await ctx.send("❌ Nothing to esnipe.")
        return

    msg = edited[-1]
    embed = discord.Embed(color=discord.Color.orange(), timestamp=msg["time"])
    embed.add_field(name="Before", value=msg["before"] or "*Empty*", inline=False)
    embed.add_field(name="After", value=msg["after"] or "*Empty*", inline=False)
    embed.set_author(name=msg["author"], icon_url=msg["avatar"])
    await ctx.send(embed=embed)

@bot.event
async def on_message_delete(message):
    if message.author.bot:
        return
    key = f"{message.guild.id}:{message.channel.id}"
    bot.snipe_data[key]["deleted"].append({
        "content": message.content,
        "author": str(message.author),
        "avatar": str(message.author.display_avatar.url),
        "time": datetime.datetime.utcnow()
    })

@bot.event
async def on_message_edit(before, after):
    if before.author.bot or before.content == after.content:
        return
    key = f"{before.guild.id}:{before.channel.id}"
    bot.snipe_data[key]["edited"].append({
        "before": before.content,
        "after": after.content,
        "author": str(before.author),
        "avatar": str(before.author.display_avatar.url),
        "time": datetime.datetime.utcnow()
    })

# ==================== GIVEAWAY COMMANDS ====================

@bot.group(name="giveaway", invoke_without_command=True, aliases=["gway", "gw"])
@commands.has_permissions(administrator=True)
async def giveaway_group(ctx):
    """Giveaway management"""
    await ctx.send("Usage: `giveaway start <duration> <winners> <prize> | giveaway end <message_id> | giveaway reroll <message_id>`")

@giveaway_group.command(name="start")
@commands.has_permissions(administrator=True)
async def gw_start(ctx, duration: str, winners: int, *, prize: str):
    """Start a giveaway"""
    td = parse_duration(duration)
    if not td:
        await ctx.send("❌ Invalid duration.")
        return

    embed = discord.Embed(
        title="🎉 Giveaway",
        description=f"**Prize:** {prize}\n**Winners:** {winners}\n**Ends:** <t:{int((datetime.datetime.utcnow() + td).timestamp())}:R>",
        color=discord.Color.blue(),
        timestamp=datetime.datetime.utcnow() + td
    )
    embed.set_footer(text=f"Hosted by {ctx.author}")
    msg = await ctx.send(embed=embed)
    await msg.add_reaction("🎉")

    bot.giveaways[str(ctx.guild.id)][str(msg.id)] = {
        "prize": prize,
        "winners": winners,
        "host": ctx.author.id,
        "channel": ctx.channel.id,
        "end_time": (datetime.datetime.utcnow() + td).isoformat(),
        "ended": False
    }

    # Wait and end
    await asyncio.sleep(td.total_seconds())
    await end_giveaway(ctx.guild, msg.id)

async def end_giveaway(guild, message_id):
    """End a giveaway and pick winners"""
    guild_id = str(guild.id)
    msg_id = str(message_id)

    if msg_id not in bot.giveaways.get(guild_id, {}):
        return

    gw = bot.giveaways[guild_id][msg_id]
    if gw["ended"]:
        return

    gw["ended"] = True
    channel = guild.get_channel(gw["channel"])
    if not channel:
        return

    try:
        msg = await channel.fetch_message(message_id)
        reaction = discord.utils.get(msg.reactions, emoji="🎉")
        if reaction:
            users = [u async for u in reaction.users() if not u.bot]
            winners = random.sample(users, min(gw["winners"], len(users)))
            winner_mentions = ", ".join([w.mention for w in winners])

            embed = discord.Embed(
                title="🎉 Giveaway Ended",
                description=f"**Prize:** {gw['prize']}\n**Winners:** {winner_mentions}",
                color=discord.Color.green()
            )
            await msg.edit(embed=embed)
            await channel.send(f"🎉 Congratulations {winner_mentions}! You won **{gw['prize']}**!")
    except:
        pass

@giveaway_group.command(name="end")
@commands.has_permissions(administrator=True)
async def gw_end(ctx, message_id: int):
    """End a giveaway early"""
    await end_giveaway(ctx.guild, message_id)
    await ctx.send("✅ Giveaway ended.")

@giveaway_group.command(name="reroll")
@commands.has_permissions(administrator=True)
async def gw_reroll(ctx, message_id: int):
    """Reroll a giveaway winner"""
    guild_id = str(ctx.guild.id)
    msg_id = str(message_id)

    gw = bot.giveaways.get(guild_id, {}).get(msg_id)
    if not gw:
        await ctx.send("❌ Giveaway not found.")
        return

    channel = ctx.guild.get_channel(gw["channel"])
    try:
        msg = await channel.fetch_message(message_id)
        reaction = discord.utils.get(msg.reactions, emoji="🎉")
        if reaction:
            users = [u async for u in reaction.users() if not u.bot]
            winner = random.choice(users)
            await ctx.send(f"🎉 New winner: {winner.mention}!")
    except:
        await ctx.send("❌ Could not reroll.")

# ==================== AUTO RESPONDER ====================

@bot.group(name="autoresponder", invoke_without_command=True, aliases=["ar"])
@commands.has_permissions(administrator=True)
async def ar_group(ctx):
    """Auto responder configuration"""
    await ctx.send("Usage: `autoresponder add <trigger> <response> | autoresponder remove <trigger> | autoresponder list`")

@ar_group.command(name="add")
@commands.has_permissions(administrator=True)
async def ar_add(ctx, trigger: str, *, response: str):
    """Add an auto responder"""
    guild_id = str(ctx.guild.id)
    if guild_id not in bot.auto_responders:
        bot.auto_responders[guild_id] = {}
    bot.auto_responders[guild_id][trigger.lower()] = response
    await ctx.send(f"✅ Auto responder added: `{trigger}` -> `{response}`")

@ar_group.command(name="remove")
@commands.has_permissions(administrator=True)
async def ar_remove(ctx, trigger: str):
    """Remove an auto responder"""
    guild_id = str(ctx.guild.id)
    if guild_id in bot.auto_responders and trigger.lower() in bot.auto_responders[guild_id]:
        del bot.auto_responders[guild_id][trigger.lower()]
        await ctx.send(f"✅ Removed auto responder: `{trigger}`")
    else:
        await ctx.send("❌ Auto responder not found.")

@ar_group.command(name="list")
@commands.has_permissions(administrator=True)
async def ar_list(ctx):
    """List auto responders"""
    guild_id = str(ctx.guild.id)
    ars = bot.auto_responders.get(guild_id, {})
    if not ars:
        await ctx.send("No auto responders configured.")
        return
    embed = discord.Embed(title="Auto Responders", color=discord.Color.blue())
    for trigger, response in ars.items():
        embed.add_field(name=trigger, value=response, inline=False)
    await ctx.send(embed=embed)

@bot.event
async def on_message(message):
    if message.author.bot or not message.guild:
        await bot.process_commands(message)
        return

    # Check auto responders
    guild_id = str(message.guild.id)
    ars = bot.auto_responders.get(guild_id, {})
    for trigger, response in ars.items():
        if trigger.lower() in message.content.lower():
            await message.channel.send(response)
            break

    await bot.process_commands(message)

# ==================== COUNTER COMMANDS ====================

@bot.group(name="counter", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def counter_group(ctx):
    """Voice channel counter configuration"""
    await ctx.send("Usage: `counter add <type> <name>`")

@counter_group.command(name="add")
@commands.has_permissions(administrator=True)
async def counter_add(ctx, counter_type: str, *, name: str):
    """Add a voice channel counter"""
    guild_id = str(ctx.guild.id)
    if guild_id not in bot.counters:
        bot.counters[guild_id] = {}

    valid_types = ["members", "bots", "channels", "roles", "boosts"]
    if counter_type not in valid_types:
        await ctx.send(f"❌ Invalid type. Valid: {', '.join(valid_types)}")
        return

    channel = await ctx.guild.create_voice_channel(name=name, reason="Bleed counter")
    bot.counters[guild_id][str(channel.id)] = {"type": counter_type, "name": name}
    await ctx.send(f"✅ Created {counter_type} counter: {channel.mention}")

@tasks.loop(minutes=5)
async def update_counters():
    """Update voice channel counters"""
    for guild_id, counters in bot.counters.items():
        guild = bot.get_guild(int(guild_id))
        if not guild:
            continue
        for channel_id, config in counters.items():
            channel = guild.get_channel(int(channel_id))
            if not channel:
                continue

            counter_type = config["type"]
            if counter_type == "members":
                count = guild.member_count
            elif counter_type == "bots":
                count = sum(1 for m in guild.members if m.bot)
            elif counter_type == "channels":
                count = len(guild.channels)
            elif counter_type == "roles":
                count = len(guild.roles)
            elif counter_type == "boosts":
                count = guild.premium_subscription_count or 0
            else:
                continue

            new_name = config["name"].replace("{count}", str(count))
            try:
                await channel.edit(name=new_name)
            except:
                pass

update_counters.start()

# ==================== BOOST COMMANDS ====================

@bot.group(name="boost", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def boost_group(ctx):
    """Boost message configuration"""
    await ctx.send("Usage: `boost channel #channel | boost message <text> | boost embed <json>`")

@boost_group.command(name="channel")
@commands.has_permissions(administrator=True)
async def boost_channel(ctx, channel: discord.TextChannel):
    """Set boost announcement channel"""
    bot.boost_settings[str(ctx.guild.id)]["channel"] = channel.id
    await ctx.send(f"✅ Boost channel set to {channel.mention}")

@boost_group.command(name="message")
@commands.has_permissions(administrator=True)
async def boost_message(ctx, *, message: str):
    """Set boost message"""
    bot.boost_settings[str(ctx.guild.id)]["message"] = message
    await ctx.send("✅ Boost message set.")

@bot.event
async def on_member_update(before, after):
    """Handle boost events"""
    if before.guild.premium_subscriber_role not in before.roles and after.guild.premium_subscriber_role in after.roles:
        guild_id = str(after.guild.id)
        settings = bot.boost_settings.get(guild_id, {})
        channel = after.guild.get_channel(settings.get("channel", 0))
        if channel:
            message = settings.get("message", "{boost.user} just boosted {guild.name}! 🎉")
            message = message.replace("{boost.user}", after.mention)
            message = message.replace("{boost.count}", str(after.guild.premium_subscription_count or 0))
            message = message.replace("{boost.total}", str(after.guild.premium_tier))
            message = message.replace("{guild.name}", after.guild.name)
            await channel.send(message)

# ==================== FUN COMMANDS ====================

@bot.command(name="8ball")
async def eightball_cmd(ctx, *, question: str):
    """Ask the magic 8ball"""
    responses = [
        "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes definitely.",
        "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
        "Yes.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
        "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
        "Don't count on it.", "My reply is no.", "My sources say no.",
        "Outlook not so good.", "Very doubtful."
    ]
    await ctx.send(f"🎱 **Question:** {question}\n**Answer:** {random.choice(responses)}")

@bot.command(name="coinflip", aliases=["cf", "flip"])
async def coinflip_cmd(ctx):
    """Flip a coin"""
    result = random.choice(["Heads", "Tails"])
    await ctx.send(f"🪙 **{result}**!")

@bot.command(name="dice", aliases=["roll"])
async def dice_cmd(ctx, sides: int = 6):
    """Roll a dice"""
    result = random.randint(1, sides)
    await ctx.send(f"🎲 Rolled a **{result}** (1-{sides})")

@bot.command(name="meme")
async def meme_cmd(ctx):
    """Get a random meme"""
    async with aiohttp.ClientSession() as session:
        async with session.get("https://meme-api.com/gimme") as resp:
            if resp.status == 200:
                data = await resp.json()
                embed = discord.Embed(title=data["title"], color=discord.Color.random())
                embed.set_image(url=data["url"])
                embed.set_footer(text=f"👍 {data['ups']} | r/{data['subreddit']}")
                await ctx.send(embed=embed)
            else:
                await ctx.send("❌ Could not fetch meme.")

@bot.command(name="blacktea")
async def blacktea_cmd(ctx):
    """Play a word game"""
    words = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew"]
    word = random.choice(words)
    await ctx.send(f"🍵 **Blacktea Game!** Type a word starting with `{word[0].upper()}`")

    def check(m):
        return m.channel == ctx.channel and m.author == ctx.author and m.content.lower().startswith(word[0])

    try:
        msg = await bot.wait_for("message", check=check, timeout=15.0)
        await ctx.send(f"✅ Good job! `{msg.content}` is a valid word!")
    except asyncio.TimeoutError:
        await ctx.send(f"⏰ Time's up! The word was `{word}`.")

@bot.command(name="tic-tac-toe", aliases=["ttt"])
async def tictactoe_cmd(ctx, opponent: discord.Member):
    """Play tic-tac-toe"""
    if opponent == ctx.author or opponent.bot:
        await ctx.send("❌ Invalid opponent.")
        return

    board = ["⬜"] * 9
    players = [ctx.author, opponent]
    symbols = ["❌", "⭕"]
    current = 0

    def board_str():
        return f"{board[0]}{board[1]}{board[2]}\n{board[3]}{board[4]}{board[5]}\n{board[6]}{board[7]}{board[8]}"

    def check_win():
        wins = [(0,1,2),(3,4,5),(6,7,8),(0,3,6),(1,4,7),(2,5,8),(0,4,8),(2,4,6)]
        for a,b,c in wins:
            if board[a] == board[b] == board[c] and board[a] != "⬜":
                return True
        return False

    msg = await ctx.send(f"**Tic-Tac-Toe**\n{players[0].mention} vs {players[1].mention}\n\n{board_str()}\n\n{players[current].mention}'s turn (1-9)")

    for _ in range(9):
        def check(m):
            return m.channel == ctx.channel and m.author == players[current] and m.content.isdigit() and 1 <= int(m.content) <= 9

        try:
            move_msg = await bot.wait_for("message", check=check, timeout=60.0)
            pos = int(move_msg.content) - 1
            if board[pos] != "⬜":
                await ctx.send("❌ That spot is taken!")
                continue

            board[pos] = symbols[current]

            if check_win():
                await msg.edit(content=f"**Tic-Tac-Toe**\n{players[0].mention} vs {players[1].mention}\n\n{board_str()}\n\n🎉 {players[current].mention} wins!")
                return

            current = 1 - current
            await msg.edit(content=f"**Tic-Tac-Toe**\n{players[0].mention} vs {players[1].mention}\n\n{board_str()}\n\n{players[current].mention}'s turn (1-9)")
        except asyncio.TimeoutError:
            await ctx.send("⏰ Game timed out.")
            return

    await msg.edit(content=f"**Tic-Tac-Toe**\n{players[0].mention} vs {players[1].mention}\n\n{board_str()}\n\n🤝 It's a draw!")

# ==================== UTILITY COMMANDS ====================

@bot.command(name="avatar", aliases=["av"])
async def avatar_cmd(ctx, user: discord.Member = None):
    """View a user's avatar"""
    user = user or ctx.author
    embed = discord.Embed(title=f"{user.name}'s Avatar", color=discord.Color.blue())
    embed.set_image(url=user.display_avatar.url)
    await ctx.send(embed=embed)

@bot.command(name="banner")
async def banner_cmd(ctx, user: discord.Member = None):
    """View a user's banner"""
    user = user or ctx.author
    user = await bot.fetch_user(user.id)
    if user.banner:
        embed = discord.Embed(title=f"{user.name}'s Banner", color=discord.Color.blue())
        embed.set_image(url=user.banner.url)
        await ctx.send(embed=embed)
    else:
        await ctx.send("❌ This user has no banner.")

@bot.command(name="serverinfo", aliases=["si", "guildinfo"])
async def serverinfo_cmd(ctx):
    """View server information"""
    guild = ctx.guild
    embed = discord.Embed(title=guild.name, color=discord.Color.blue())
    embed.add_field(name="Owner", value=guild.owner.mention if guild.owner else "Unknown")
    embed.add_field(name="Members", value=guild.member_count)
    embed.add_field(name="Channels", value=len(guild.channels))
    embed.add_field(name="Roles", value=len(guild.roles))
    embed.add_field(name="Boosts", value=f"{guild.premium_subscription_count or 0} (Tier {guild.premium_tier})")
    embed.add_field(name="Created", value=f"<t:{int(guild.created_at.timestamp())}:R>")
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    await ctx.send(embed=embed)

@bot.command(name="userinfo", aliases=["ui", "whois"])
async def userinfo_cmd(ctx, user: discord.Member = None):
    """View user information"""
    user = user or ctx.author
    embed = discord.Embed(title=str(user), color=user.color)
    embed.add_field(name="ID", value=user.id)
    embed.add_field(name="Created", value=f"<t:{int(user.created_at.timestamp())}:R>")
    embed.add_field(name="Joined", value=f"<t:{int(user.joined_at.timestamp())}:R>")
    embed.add_field(name="Roles", value=", ".join([r.mention for r in user.roles[1:]]) if len(user.roles) > 1 else "None")
    embed.set_thumbnail(url=user.display_avatar.url)
    await ctx.send(embed=embed)

@bot.command(name="roleinfo")
async def roleinfo_cmd(ctx, role: discord.Role):
    """View role information"""
    embed = discord.Embed(title=role.name, color=role.color)
    embed.add_field(name="ID", value=role.id)
    embed.add_field(name="Members", value=len(role.members))
    embed.add_field(name="Color", value=str(role.color))
    embed.add_field(name="Created", value=f"<t:{int(role.created_at.timestamp())}:R>")
    embed.add_field(name="Position", value=role.position)
    embed.add_field(name="Mentionable", value="Yes" if role.mentionable else "No")
    await ctx.send(embed=embed)

@bot.command(name="channelinfo")
async def channelinfo_cmd(ctx, channel: discord.TextChannel = None):
    """View channel information"""
    channel = channel or ctx.channel
    embed = discord.Embed(title=f"#{channel.name}", color=discord.Color.blue())
    embed.add_field(name="ID", value=channel.id)
    embed.add_field(name="Type", value=str(channel.type))
    embed.add_field(name="Created", value=f"<t:{int(channel.created_at.timestamp())}:R>")
    embed.add_field(name="NSFW", value="Yes" if channel.is_nsfw() else "No")
    embed.add_field(name="Slowmode", value=f"{channel.slowmode_delay}s" if channel.slowmode_delay else "None")
    embed.add_field(name="Topic", value=channel.topic or "None")
    await ctx.send(embed=embed)

@bot.command(name="emojiinfo")
async def emojiinfo_cmd(ctx, emoji: discord.Emoji):
    """View emoji information"""
    embed = discord.Embed(title=emoji.name, color=discord.Color.blue())
    embed.add_field(name="ID", value=emoji.id)
    embed.add_field(name="Animated", value="Yes" if emoji.animated else "No")
    embed.add_field(name="Created", value=f"<t:{int(emoji.created_at.timestamp())}:R>")
    embed.set_thumbnail(url=emoji.url)
    await ctx.send(embed=embed)

@bot.command(name="translate")
async def translate_cmd(ctx, target_lang: str, *, text: str):
    """Translate text (mock implementation)"""
    # This would require a translation API key
    await ctx.send(f"🌐 Translation to `{target_lang}`: `{text}` (Requires API key - integrate LibreTranslate or Google Translate)")

@bot.command(name="weather")
async def weather_cmd(ctx, *, location: str):
    """Get weather (mock implementation)"""
    await ctx.send(f"🌤️ Weather for `{location}`: (Requires OpenWeatherMap API key)")

@bot.command(name="poll")
async def poll_cmd(ctx, question: str, *options):
    """Create a poll"""
    if len(options) < 2:
        await ctx.send("❌ Provide at least 2 options.")
        return
    if len(options) > 10:
        await ctx.send("❌ Maximum 10 options.")
        return

    emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
    description = "\n".join([f"{emojis[i]} {opt}" for i, opt in enumerate(options)])

    embed = discord.Embed(title=f"📊 {question}", description=description, color=discord.Color.blue())
    embed.set_footer(text=f"Poll by {ctx.author}")
    msg = await ctx.send(embed=embed)

    for i in range(len(options)):
        await msg.add_reaction(emojis[i])

@bot.command(name="remind", aliases=["reminder"])
async def remind_cmd(ctx, duration: str, *, reminder: str):
    """Set a reminder"""
    td = parse_duration(duration)
    if not td:
        await ctx.send("❌ Invalid duration.")
        return

    await ctx.send(f"⏰ I'll remind you in {format_duration(td)}: `{reminder}`")
    await asyncio.sleep(td.total_seconds())
    await ctx.send(f"⏰ {ctx.author.mention} Reminder: {reminder}")

@bot.command(name="afk")
async def afk_cmd(ctx, *, reason: str = "AFK"):
    """Set AFK status"""
    # Simple implementation - would need a more robust system
    await ctx.send(f"💤 {ctx.author.mention} is now AFK: {reason}")

@bot.command(name="say")
async def say_cmd(ctx, *, message: str):
    """Make the bot say something"""
    await ctx.message.delete()
    await ctx.send(message)

@bot.command(name="embed")
async def embed_cmd(ctx, *, json_code: str):
    """Send an embed from JSON"""
    try:
        data = json.loads(json_code)
        embed = discord.Embed.from_dict(data)
        await ctx.send(embed=embed)
    except json.JSONDecodeError as e:
        await ctx.send(f"❌ Invalid JSON: {e}")

# ==================== MUSIC COMMANDS (Mock) ====================

@bot.group(name="play", invoke_without_command=True)
async def play_group(ctx, *, query: str):
    """Play music"""
    await ctx.send(f"🎵 Searching for: `{query}` (Requires Lavalink/music integration)")

@bot.command(name="pause")
async def pause_cmd(ctx):
    """Pause music"""
    await ctx.send("⏸️ Paused (Requires music integration)")

@bot.command(name="resume")
async def resume_cmd(ctx):
    """Resume music"""
    await ctx.send("▶️ Resumed (Requires music integration)")

@bot.command(name="skip")
async def skip_cmd(ctx):
    """Skip current track"""
    await ctx.send("⏭️ Skipped (Requires music integration)")

@bot.command(name="stop")
async def stop_cmd(ctx):
    """Stop music"""
    await ctx.send("⏹️ Stopped (Requires music integration)")

@bot.command(name="queue")
async def queue_cmd(ctx):
    """View music queue"""
    await ctx.send("📋 Queue (Requires music integration)")

@bot.command(name="nowplaying", aliases=["np"])
async def nowplaying_cmd(ctx):
    """View currently playing"""
    await ctx.send("🎵 Now Playing (Requires music integration)")

@bot.command(name="volume")
async def volume_cmd(ctx, vol: int):
    """Set volume"""
    if not 0 <= vol <= 100:
        await ctx.send("❌ Volume must be 0-100.")
        return
    await ctx.send(f"🔊 Volume set to {vol}% (Requires music integration)")

# ==================== SPOTIFY COMMANDS (Mock) ====================

@bot.group(name="spotify", invoke_without_command=True, aliases=["sp"])
async def spotify_group(ctx):
    """Spotify integration"""
    await ctx.send("Usage: `spotify login | spotify play <query> | spotify queue <query>`")

@spotify_group.command(name="login")
async def sp_login(ctx):
    """Link Spotify account"""
    await ctx.send("🔗 [Click here to link your Spotify account](https://accounts.spotify.com/authorize) (Requires Spotify API setup)")

@spotify_group.command(name="logout")
async def sp_logout(ctx):
    """Unlink Spotify account"""
    bot.spotify_links.pop(str(ctx.author.id), None)
    await ctx.send("✅ Spotify account unlinked.")

@spotify_group.command(name="play")
async def sp_play(ctx, *, query: str):
    """Play a track on Spotify"""
    await ctx.send(f"🎵 Playing: `{query}` on Spotify (Requires Spotify Premium + API)")

@spotify_group.command(name="queue")
async def sp_queue(ctx, *, query: str):
    """Queue a track on Spotify"""
    await ctx.send(f"🎵 Queued: `{query}` (Requires Spotify Premium + API)")

@spotify_group.command(name="volume")
async def sp_volume(ctx, percentage: int):
    """Adjust Spotify volume"""
    await ctx.send(f"🔊 Spotify volume set to {percentage}% (Requires Spotify Premium + API)")

@spotify_group.command(name="seek")
async def sp_seek(ctx, position: str):
    """Seek to position"""
    await ctx.send(f"⏩ Seeked to {position} (Requires Spotify Premium + API)")

@spotify_group.command(name="next")
async def sp_next(ctx):
    """Skip to next track"""
    await ctx.send("⏭️ Next track (Requires Spotify Premium + API)")

@spotify_group.command(name="previous")
async def sp_previous(ctx):
    """Previous track"""
    await ctx.send("⏮️ Previous track (Requires Spotify Premium + API)")

@spotify_group.command(name="pause")
async def sp_pause(ctx):
    """Pause Spotify"""
    await ctx.send("⏸️ Paused (Requires Spotify Premium + API)")

@spotify_group.command(name="resume")
async def sp_resume(ctx):
    """Resume Spotify"""
    await ctx.send("▶️ Resumed (Requires Spotify Premium + API)")

@spotify_group.command(name="shuffle")
async def sp_shuffle(ctx):
    """Toggle shuffle"""
    await ctx.send("🔀 Shuffle toggled (Requires Spotify Premium + API)")

@spotify_group.command(name="repeat")
async def sp_repeat(ctx):
    """Toggle repeat"""
    await ctx.send("🔁 Repeat toggled (Requires Spotify Premium + API)")

@spotify_group.command(name="like")
async def sp_like(ctx):
    """Like current track"""
    await ctx.send("❤️ Liked current track (Requires Spotify API)")

@spotify_group.command(name="unlike")
async sp_unlike(ctx):
    """Unlike current track"""
    await ctx.send("💔 Unliked current track (Requires Spotify API)")

@spotify_group.command(name="artists")
async def sp_artists(ctx, timeframe: str):
    """View top artists"""
    await ctx.send(f"🎤 Top artists for `{timeframe}` (Requires Spotify API)")

@spotify_group.command(name="tracks")
async def sp_tracks(ctx, timeframe: str):
    """View top tracks"""
    await ctx.send(f"🎵 Top tracks for `{timeframe}` (Requires Spotify API)")

@spotify_group.command(name="vc")
async def sp_vc(ctx):
    """Play current track in VC"""
    await ctx.send("🎵 Playing current track in voice channel (Requires Spotify Premium + music integration)")

# ==================== LAST.FM COMMANDS (Mock) ====================

@bot.group(name="lastfm", invoke_without_command=True, aliases=["lfm", "fm"])
async def lastfm_group(ctx):
    """Last.fm integration"""
    await ctx.send("Usage: `lastfm login | lastfm refresh`")

@lastfm_group.command(name="login")
async def lfm_login(ctx):
    """Link Last.fm account"""
    await ctx.send("🔗 Check your DMs for Last.fm linking instructions. (Requires Last.fm API setup)")

@lastfm_group.command(name="refresh")
async def lfm_refresh(ctx):
    """Refresh Last.fm library"""
    await ctx.send("🔄 Refreshing library... (Requires Last.fm API)")

# ==================== BUMP REMINDER ====================

@bot.group(name="bumpreminder", invoke_without_command=True, aliases=["bump"])
@commands.has_permissions(administrator=True)
async def bump_group(ctx):
    """Bump reminder configuration"""
    await ctx.send("Usage: `bumpreminder channel #channel | bumpreminder message <text>`")

@bump_group.command(name="channel")
@commands.has_permissions(administrator=True)
async def bump_channel(ctx, channel: discord.TextChannel):
    """Set bump reminder channel"""
    bot.bump_reminders[str(ctx.guild.id)]["channel"] = channel.id
    await ctx.send(f"✅ Bump reminder channel set to {channel.mention}")

@bump_group.command(name="message")
@commands.has_permissions(administrator=True)
async def bump_message(ctx, *, message: str):
    """Set bump reminder message"""
    bot.bump_reminders[str(ctx.guild.id)]["message"] = message
    await ctx.send("✅ Bump reminder message set.")

@bot.event
async def on_message(message):
    if message.author.id == 302050872383242240:  # Disboard bot ID
        if message.embeds and "bump done" in message.embeds[0].description.lower():
            guild_id = str(message.guild.id)
            settings = bot.bump_reminders.get(guild_id, {})
            channel = message.guild.get_channel(settings.get("channel", message.channel.id))
            if channel:
                msg = settings.get("message", "🚀 It's time to bump! Use `/bump`")
                await asyncio.sleep(7200)  # 2 hours
                await channel.send(msg)
    await bot.process_commands(message)

# ==================== FAKE PERMISSIONS ====================

@bot.group(name="fakepermissions", invoke_without_command=True, aliases=["fakeperms", "fp"])
@commands.has_permissions(administrator=True)
async def fp_group(ctx):
    """Fake permissions configuration"""
    await ctx.send("Usage: `fakepermissions add @role <permission> | fakepermissions remove @role <permission> | fakepermissions list`")

@fp_group.command(name="add")
@commands.has_permissions(administrator=True)
async def fp_add(ctx, role: discord.Role, permission: str):
    """Add fake permission to role"""
    guild_id = str(ctx.guild.id)
    if guild_id not in bot.fake_permissions:
        bot.fake_permissions[guild_id] = {}
    if str(role.id) not in bot.fake_permissions[guild_id]:
        bot.fake_permissions[guild_id][str(role.id)] = []

    bot.fake_permissions[guild_id][str(role.id)].append(permission)
    await ctx.send(f"✅ Added fake permission `{permission}` to {role.mention}")

@fp_group.command(name="remove")
@commands.has_permissions(administrator=True)
async def fp_remove(ctx, role: discord.Role, permission: str):
    """Remove fake permission from role"""
    guild_id = str(ctx.guild.id)
    perms = bot.fake_permissions.get(guild_id, {}).get(str(role.id), [])
    if permission in perms:
        perms.remove(permission)
        await ctx.send(f"✅ Removed fake permission `{permission}` from {role.mention}")
    else:
        await ctx.send("❌ Permission not found.")

@fp_group.command(name="list")
@commands.has_permissions(administrator=True)
async def fp_list(ctx, role: discord.Role = None):
    """List fake permissions"""
    guild_id = str(ctx.guild.id)
    if role:
        perms = bot.fake_permissions.get(guild_id, {}).get(str(role.id), [])
        await ctx.send(f"**Fake permissions for {role.mention}:** {', '.join(perms) if perms else 'None'}")
    else:
        embed = discord.Embed(title="Fake Permissions", color=discord.Color.blue())
        for rid, perms in bot.fake_permissions.get(guild_id, {}).items():
            r = ctx.guild.get_role(int(rid))
            if r:
                embed.add_field(name=r.name, value=", ".join(perms), inline=False)
        await ctx.send(embed=embed)

# ==================== AUTOMOD COMMANDS ====================

@bot.group(name="automod", invoke_without_command=True)
@commands.has_permissions(administrator=True)
async def automod_group(ctx):
    """Automod configuration"""
    await ctx.send("Usage: `automod add <type> <action> | automod remove <rule_id> | automod list`")

@automod_group.command(name="add")
@commands.has_permissions(administrator=True)
async def automod_add(ctx, rule_type: str, action: str, *, config: str = ""):
    """Add an automod rule"""
    valid_types = ["spam", "mention", "link", "invite", "caps", "badwords"]
    valid_actions = ["delete", "warn", "mute", "kick", "ban"]

    if rule_type not in valid_types:
        await ctx.send(f"❌ Invalid type. Valid: {', '.join(valid_types)}")
        return
    if action not in valid_actions:
        await ctx.send(f"❌ Invalid action. Valid: {', '.join(valid_actions)}")
        return

    rule = {
        "id": len(bot.automod_rules.get(str(ctx.guild.id), [])) + 1,
        "type": rule_type,
        "action": action,
        "config": config
    }
    bot.automod_rules[str(ctx.guild.id)].append(rule)
    await ctx.send(f"✅ Added automod rule #{rule['id']}: `{rule_type}` -> `{action}`")

@automod_group.command(name="remove")
@commands.has_permissions(administrator=True)
async def automod_remove(ctx, rule_id: int):
    """Remove an automod rule"""
    guild_id = str(ctx.guild.id)
    rules = bot.automod_rules.get(guild_id, [])
    for i, rule in enumerate(rules):
        if rule["id"] == rule_id:
            del rules[i]
            await ctx.send(f"✅ Removed automod rule #{rule_id}.")
            return
    await ctx.send("❌ Rule not found.")

@automod_group.command(name="list")
@commands.has_permissions(administrator=True)
async def automod_list(ctx):
    """List automod rules"""
    guild_id = str(ctx.guild.id)
    rules = bot.automod_rules.get(guild_id, [])
    if not rules:
        await ctx.send("No automod rules configured.")
        return
    embed = discord.Embed(title="Automod Rules", color=discord.Color.red())
    for rule in rules:
        embed.add_field(name=f"#{rule['id']} | {rule['type']}", value=f"Action: {rule['action']}", inline=False)
    await ctx.send(embed=embed)

@bot.event
async def on_message(message):
    if message.author.bot or not message.guild:
        await bot.process_commands(message)
        return

    # Simple automod checks
    guild_id = str(message.guild.id)
    rules = bot.automod_rules.get(guild_id, [])

    for rule in rules:
        triggered = False
        if rule["type"] == "spam" and len(message.content) > 2000:
            triggered = True
        elif rule["type"] == "mention" and len(message.mentions) > 5:
            triggered = True
        elif rule["type"] == "link" and "http" in message.content:
            triggered = True
        elif rule["type"] == "invite" and "discord.gg" in message.content:
            triggered = True
        elif rule["type"] == "caps" and sum(1 for c in message.content if c.isupper()) > len(message.content) * 0.7:
            triggered = True

        if triggered:
            if rule["action"] == "delete":
                await message.delete()
            elif rule["action"] == "warn":
                await message.channel.send(f"⚠️ {message.author.mention} Watch your behavior!")
            elif rule["action"] == "mute":
                muted = discord.utils.get(message.guild.roles, name="Muted")
                if muted:
                    await message.author.add_roles(muted, reason="Automod")
            elif rule["action"] == "kick":
                await message.author.kick(reason="Automod")
            elif rule["action"] == "ban":
                await message.author.ban(reason="Automod")
            break

    await bot.process_commands(message)

# ==================== HELP COMMAND ====================

@bot.command(name="help")
async def help_cmd(ctx, category: str = None):
    """Show help menu"""
    prefix = await bot.get_prefix(ctx.message)
    if isinstance(prefix, list):
        prefix = prefix[0]

    embed = discord.Embed(title="Bleed Bot Help", color=discord.Color.blue())

    if not category:
        embed.add_field(name="🔧 Setup", value=f"`{prefix}setup`, `{prefix}setupmute`, `{prefix}prefix`", inline=False)
        embed.add_field(name="🛡️ Moderation", value=f"`{prefix}jail`, `{prefix}ban`, `{prefix}kick`, `{prefix}mute`, `{prefix}warn`, `{prefix}cases`", inline=False)
        embed.add_field(name="🔒 Antinuke", value=f"`{prefix}antinuke`", inline=False)
        embed.add_field(name="🎉 Fun", value=f"`{prefix}8ball`, `{prefix}coinflip`, `{prefix}meme`, `{prefix}blacktea`, `{prefix}tic-tac-toe`", inline=False)
        embed.add_field(name="📊 Utility", value=f"`{prefix}avatar`, `{prefix}serverinfo`, `{prefix}userinfo`, `{prefix}poll`", inline=False)
        embed.add_field(name="⭐ Levels", value=f"`{prefix}level`, `{prefix}leaderboard`", inline=False)
        embed.add_field(name="🎁 Giveaways", value=f"`{prefix}giveaway`", inline=False)
        embed.add_field(name="🔔 Welcome/Leave", value=f"`{prefix}welcome`, `{prefix}leave`", inline=False)
        embed.add_field(name="🎵 Music", value=f"`{prefix}play`, `{prefix}pause`, `{prefix}skip`", inline=False)
        embed.add_field(name="🔗 Spotify", value=f"`{prefix}spotify`", inline=False)
    else:
        embed.description = f"Use `{prefix}help` for command categories."

    await ctx.send(embed=embed)

# ==================== ERROR HANDLING ====================

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        return
    elif isinstance(error, commands.MissingPermissions):
        await ctx.send(f"❌ You need `{', '.join(error.missing_permissions)}` permission(s).")
    elif isinstance(error, commands.BotMissingPermissions):
        await ctx.send(f"❌ I need `{', '.join(error.missing_permissions)}` permission(s).")
    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"❌ Missing argument: `{error.param.name}`")
    elif isinstance(error, commands.BadArgument):
        await ctx.send(f"❌ Bad argument: {error}")
    elif isinstance(error, commands.CheckFailure):
        await ctx.send(f"❌ {error}")
    else:
        print(f"Error: {error}")
        await ctx.send(f"❌ An error occurred: `{error}`")

# ==================== RUN ====================

if __name__ == "__main__":
    if not TOKEN:
        print("ERROR: No DISCORD_TOKEN found in environment variables!")
        print("Create a .env file with: DISCORD_TOKEN=your_token_here")
        exit(1)
    bot.run(TOKEN)
