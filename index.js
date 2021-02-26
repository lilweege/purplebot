const env = require("dotenv").config({ path: "./.env" });
const fs = require('fs');

const Discord = require('discord.js');
const client = new Discord.Client();

let channelID = "";
const setChannel = (msg, args) => {
	if (args.length !== 1) {
		msg.channel.send("Invalid command, try \"&set channelname\"");
		return;
	}
	let name = args[0];
	let channels = client.channels.cache.filter(channel => channel.type === "text" && channel.name === name);
	if (channels.size !== 1) {
		msg.channel.send("Multiple or no text channels were found");
		return;
	}
	
	let channel = Array.from(channels.values())[0];
	channelID = channel.id;
	msg.channel.send(`${channel.id} selected`);
}

const startDiff = () => {
	let EST = -5;
	let now = new Date();
	let first = new Date();
	
	// starting time
	first.setHours(5 + EST, 30, 2, 0);
	now.setHours(now.getHours() + EST);
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
	// about one whole second behind real
	// time, so simply add two seconds as
	// a buffer so we don't arrive too early
	
	// for now, assume this never stops or
	// becomes out of sync from start hour
	// next.setHours(next.getHours() + 12, 26, 2, 0);
	
	next.setHours(next.getHours(), next.getMinutes() + 10, 2, 0);
	return next - now;
}

let timeout;
const sendMessage = () => {
	if (channelID.length !== 0)
		client.channels.cache.get(channelID).send("126");
	
	// setInterval would be smart, but I am not smart
	timeout = setTimeout(sendMessage, nextDiff());
}

client.once('ready', () => {
	console.log('client ready');
	timeout = setTimeout(sendMessage, startDiff());
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
	}
});


client.login(process.env.TOKEN);
