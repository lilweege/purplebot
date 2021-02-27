const env = require("dotenv").config({ path: "./.env" });
const fs = require('fs');

const Discord = require('discord.js');
const client = new Discord.Client();

let wordList = ["126", "buuuuuuuuuuuuurrrrrrrrrrrrrrp", "rootbeer", "poutine time", "currently right now at the moment grinding fate", "shut the fuck up you dumb crodie"]

// "guildID" : "channelID"
// each server (guild) can have a single "selected" text channel
let selectedChannels = {};

const setChannel = (msg, args) => {
	if (args.length !== 1) {
		msg.channel.send("Usage: \"set channelname\"");
		return;
	}
	const name = args[0];
	const guildID = msg.channel.guild.id;
	const channels = client.channels.cache.filter(channel =>
		channel.type === "text" &&
		channel.name === name &&
		channel.guild.id == guildID);
	
	if (channels.size !== 1) {
		msg.channel.send("Multiple or no text channels were found");
		return;
	}
	const channelID = Array.from(channels.values())[0].id;
	selectedChannels[guildID] = channelID;
	msg.channel.send(`${channelID} selected`);
}

const getChannel = (msg, args) => {
	const guildID = msg.channel.guild.id;
	const channelID = selectedChannels[guildID];
	msg.channel.send(`${channelID.length === 0 ? "Nothing" : channelID} selected`);
}

const killChannel = (msg, args) => {
	const guildID = msg.channel.guild.id;
	selectedChannels[guildID] = "";
	msg.channel.send("Nothing selected");
}

const initDiff = () => {
	let now = new Date();
	let first = new Date();
	
	// starting time
	now.setHours(now.getHours());
	first.setHours(1, 26, 1, 0);
	
	let diff = first - now;
	if (diff < 0) {
		first.setHours(first.getHours() + 12);
		diff = first - now;
	}
	return diff;
}

const nextDiff = () => {
	let now = new Date();
	let next = new Date();
	// for some reason discord seems to be
	// a little less than a second behind real
	// time, so simply add one seconds as
	// a buffer so we don't arrive too early
	
	// for now, assume this never stops or
	// becomes out of sync from start hour
	next.setHours(next.getHours() + 12, 26, 1, 0);
	
	// next.setHours(next.getHours(), next.getMinutes(), next.getSeconds() + 5, 0);
	return next - now;
}

let timeout;
const sendMessage = () => {
	for (let guildID in selectedChannels) {
		const channelID = selectedChannels[guildID];
		const word = wordList[Math.floor(Math.random() * wordList.length)];
		if (channelID.length !== 0)
			client.channels.cache.get(channelID).send(word);
	}
	
	// setInterval would be smart, but I am not smart
	timeout = setTimeout(sendMessage, nextDiff());
}

client.once('ready', () => {
	console.log('client ready');
	
	for (let guildID of client.guilds.cache.keys())
		selectedChannels[guildID] = "";
	
	let time = initDiff();
	console.log("first in", time, "ms");
	timeout = setTimeout(sendMessage, time);
});


const prefix = '&';
client.on('message', msg => {
	if (!msg.content.startsWith(prefix) || msg.author.bot)
		return;
	const args = msg.content.slice(prefix.length).split(/ +/);
	const cmd = args.shift().toLowerCase();
	
	switch (cmd) {
		case 'set':
			setChannel(msg, args);
			break;
		case 'kill':
			killChannel(msg, args);
			break;
		case 'get':
			getChannel(msg, args);
			break;
		case '126':
			const word = wordList[Math.floor(Math.random() * wordList.length)];
			msg.channel.send(word);
			break;
		default:
			msg.channel.send("Try commands \"set\", \"get\", \"kill\" and \"126\"");
			break;
	}
});


client.login(process.env.TOKEN);
