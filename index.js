const env = require("dotenv").config({ path: "./.env" });
const fs = require('fs');

const Discord = require('discord.js');
const client = new Discord.Client();

const Mongoose = require('mongoose');
const uri = `mongodb+srv://discord-bot:${process.env.DB_PASS}@cluster0.rlus3.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;

const userSchema = new Mongoose.Schema({
	userId: String,
	purpleCoins: Number,
	claimedDaily: Boolean
});
const Account = Mongoose.model('Account', userSchema);
const betSchema = new Mongoose.Schema({
	userId: String,
	amount: Number,
	phrase: Number
});
const Bet = Mongoose.model('Bet', betSchema);

const serverSchema = new Mongoose.Schema({
	serverId: String,
	selectedChannel: String,
	userList: [userSchema],
	betList: [betSchema]
});
const Guild = Mongoose.model('Guild', serverSchema);


(async() => {
	await Mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
	console.log("db connected");
})();

// existing and new
const findServer = async(sID) => {
	let found;
	await Guild.find({ serverId: sID })
		.then(entries => { found = entries[0] })
		.catch(err => {});
	if (!found) {
		found = new Guild({
			serverId: sID,
			selectedChannel: "",
			userList: undefined
		});
		await found.save(err => {});
	}
	return found;
}

const getServers = async() => {
	let servers = [];
	await Guild.find()
		.then(entries => {
			servers = entries;
		})
		.catch(err => {})
	return servers;
}

const setChannel = async(server, channelID) => {
	server.selectedChannel = channelID;
	await server.save(err => {});
}

const getUser = (server, uID) => {
	for (let user of server.userList)
		if (user.userId === uID)
			return user;
}

const updateUser = async(server, userID, {coins = 0, daily}) => {
	let user = getUser(server, userID);
	if (!user) {
		console.warn("user is undefined");
		return;
	}
	user.purpleCoins = coins;
	if (daily !== undefined)
		user.claimedDaily = daily;
	await server.save(err => {});
}

const newBet = async(server, uID, amt, num) => {
	let bet = new Bet({
		userId: uID,
		amount: amt,
		phrase: num
	});
	server.betList.push(bet);
	await server.save(err => {});
	return bet;
}

const getOrCreateUser = async(server, userID) => {
	let user = getUser(server, userID);
	if (!user) {
		user = new Account({
			userId: userID,
			purpleCoins: 0,
			claimedDaily: false
		});
		server.userList.push(user);
		await server.save(err => {});
	}
	return user;
}



const human_millis = (ms, digits=10) => {
	// yoinked from https://stackoverflow.com/questions/8211744/convert-time-interval-given-in-seconds-into-more-human-readable-form
	const levels=[
		["ms", 1000],
		["sec", 60],
		["min", 60],
		["hrs", 24],
		["days", 7],
		["weeks", (30/7)], // Months are intuitively around 30 days
		["months", 12.1666666666666666], // Compensate for bakari-da in last step
		["years", 10],
		["decades", 10],
		["centuries", 10],
		["millenia", 10],
	];
	let value = ms;
	let name = "";
	let step = 1;
	for (let i = 0, max = levels.length; i < max; ++i) {
		value /= step;
		name = levels[i][0];
		step = levels[i][1];
		if (value < step)
			break;
	}
	return value.toFixed(digits) + " " + name;
}

const nextEvent = () => {
	let now = new Date();
	// the time offset from the machine
	// that heroku uses to host and EST
	let EST = 5;
	let OFFSET = EST - (now.getTimezoneOffset() / 60);
	// console.log("machine timezone offset:", OFFSET, "hours");
	let first = new Date();
	
	// starting time
	now.setHours(now.getHours());
	// for some reason discord seems to be
	// a little less than a second behind real
	// time, so simply add one seconds as
	// a buffer so we don't arrive too early
	first.setHours(1 + OFFSET, 26, 1, 0);
	
	let diff = first - now;
	while (diff < 0) {
		first.setHours(first.getHours() + 12);
		diff = first - now;
	}
	return diff;
}


const version = "1.1";
const dailyAmount = 75;
const minimumBet = 25;
const abstainTax = 50;

// const alex = "<@275843202219507712>";
const phraseList = ["126", "buuuuuuuuuuuuurrrrrrrrrrrrrrp", "rootbeer", "poutine time", "currently right now at the moment grinding fate", "shut the fuck up you dumb crodie"];
const randomPhrase = () => Math.floor(Math.random() * phraseList.length);

let timeout;
const restartTimeout = () => {
	let time = nextEvent();
	console.log(`first in ${time} ms => ${human_millis(time)}`);
	
	// setInterval would be smart, but I am not smart
	clearTimeout(timeout);
	timeout = setTimeout(triggerEvent, time);
}

const triggerEvent = async() => {
	let servers = await getServers();
	for (let server of servers) {
		// reset daily claims
		for (let user of server.userList)
			if (user.claimedDaily)
				user.claimedDaily = false;
		
		let channelID = server.selectedChannel;
		if (channelID.length === 0) {
			
			// send message
			let phrase = randomPhrase();
			client.channels.cache.get(channelID).send(phraseList[phrase]);
			
			// payout bets
			let betters = new Set();
			for (let bet of server.betList) {
				betters.add(bet.userId);
				bet.phrase -= 1;
				if (bet.phrase === phrase) {
					// n^2 but whatever
					let user = getUser(server, bet.userId);
					user.purpleCoins += bet.amount * phraseList.length;
					// user.purpleCoins += bet.amount * payout[bet.phrase];
				}
			}
			server.betList = [];
			
			// coin bleeding
			for (let user in server.userList)
				if (!betters.has(user.userId)) {
					user.purpleCoins -= abstainTax;
					if (user.purpleCoins < 0)
						user.purpleCoins = 0;
				}
		}
		
		await server.save(err => {})
	}
	
	restartTimeout();
}



const set = async(msg, args) => {
	if (args.length !== 1) {
		msg.channel.send("Usage: \"set channelname\"");
		return;
	}
	
	let guildID = msg.guild.id;
	let name = args[0];
	let channels = msg.guild.channels.cache.filter(channel =>
		channel.type === "text" &&
		channel.name === name &&
		channel.guild.id === guildID);
	
	if (channels.size !== 1) {
		msg.channel.send("Multiple or no text channels were found");
		return;
	}
	
	let server = await findServer(guildID);
	let channelID = Array.from(channels.values())[0].id;
	await setChannel(server, channelID);
	msg.channel.send(`${channelID} selected`);
}

const get = async(msg, args) => {
	const guildID = msg.guild.id;
	let server = await findServer(guildID);
	const channelID = server.selectedChannel;
	msg.channel.send(`${channelID.length === 0 ? "Nothing" : channelID} selected`);
}

const kill = async(msg, args) => {
	const guildID = msg.guild.id;
	let server = await findServer(guildID);
	await setChannel(server, "");
	msg.channel.send("Nothing selected");
}

const bal = async(msg, args) => {
	if (args.length > 1) {
		msg.channel.send("Usage: \"bal username\"");
		return;
	}
	
	let userID;
	let username;
	let isSelf = args.length === 0;
	if (isSelf) {
		username = msg.author.username;
		userID = msg.author.id;
	}
	else {
		username = args[0];
		let users = msg.guild.members.cache.filter(member =>
			member.user.username === username);
		
		if (users.size !== 1) {
			msg.channel.send("Multiple or no users were found");
			return;
		}
		userID = Array.from(users.values())[0].id;
	}
	
	let guildID = msg.guild.id;
	let server = await findServer(guildID);
	let user = await getOrCreateUser(server, userID);
	
	msg.channel.send(`${username}${isSelf ? ", you have" : " has"} ${user.purpleCoins} purple coins`);
}

const top = async(msg, args) => {
	let board = ":purple_circle: purple coin leaderboard :purple_circle:\n";
	const guildID = msg.guild.id;
	let server = await findServer(guildID);
	let users = server.userList;
	users.sort((a, b) => b.purpleCoins - a.purpleCoins);
	
	let i = 0;
	for (let user in users) {
		if (!user)
			continue;
		
		let userID = users[user].userId;
		if (!users[user] || users[user].purpleCoins === 0 || i > 10)
			break;
		
		let cur = msg.guild.members.cache.get(userID);
		if (cur && cur.user)
			board += `#${++i}: ${cur.user.username} with ${users[user].purpleCoins} coins\n`;
	}
	msg.channel.send(board);
}

const give = async(msg, args) => {
	if (args.length !== 2) {
		msg.channel.send("Usage: \"give username amount\"");
		return;
	}
	let [otherUsername, amount] = args;
	
	let users = msg.guild.members.cache.filter(member =>
		member.user.username === otherUsername);
	if (users.size !== 1) {
		msg.channel.send("Invalid username");
		return;
	}
	let otherUserID = Array.from(users.values())[0].id;
	
	amount = parseInt(amount);
	if (isNaN(amount) || amount <= 0) {
		msg.channel.send("Invalid amount");
		return;
	}
	
	let selfUsername = msg.author.username;
	let selfUserID = msg.author.id;
	let guildID = msg.guild.id;
	let server = await findServer(guildID);
	
	let self = await getOrCreateUser(server, selfUserID);
	let other = await getOrCreateUser(server, otherUserID);
	
	if (amount > self.purpleCoins) {
		msg.channel.send(`You only have ${self.purpleCoins} coins`);
		return;
	}
	
	await updateUser(server, selfUserID, { coins: self.purpleCoins - amount });
	await updateUser(server, otherUserID, { coins: other.purpleCoins + amount });
	
	msg.channel.send(`You gave ${amount} and now have ${self.purpleCoins}`);
}


const daily = async(msg, args) => {
	let guildID = msg.guild.id;
	let server = await findServer(guildID);
	
	let userID = msg.author.id;
	let username = msg.author.username;
	let user = await getOrCreateUser(server, userID);
	
	if (user.claimedDaily) {
		msg.channel.send(`${username}, you already recieved your claim`);
	}
	else {
		await updateUser(server, userID, { coins: user.purpleCoins + dailyAmount, daily: true });
		msg.channel.send(`${username}, you recieved ${dailyAmount} purple coins`);
	}
}

const bet = async(msg, args) => {
	if (args.length !== 2) {
		msg.channel.send("Usage: \"bet amount number\"");
		return;
	}
	
	let [amount, phrase] = args;
	phrase = parseInt(phrase);
	if (isNaN(phrase) || phrase < 1 || phrase > phraseList.length) {
		msg.channel.send(`Invalid number, must be between 1 and ${phraseList.length}`);
		return;
	}
	
	amount = parseInt(amount)
	if (isNaN(amount) || amount < minimumBet) {
		msg.channel.send(`Invalid amount, must be at least ${minimumBet}`);
		return;
	}
	
	let guildID = msg.guild.id;
	let server = await findServer(guildID);
	let userID = msg.author.id;
	let user = await getOrCreateUser(server, userID);
	
	if (amount > user.purpleCoins) {
		msg.channel.send(`You only have ${user.purpleCoins} coins`);
		return;
	}
	
	await updateUser(server, userID, { coins: user.purpleCoins - amount });
	await newBet(server, userID, amount, phrase);
	msg.channel.send(`${amount} coins placed on ${phraseList[phrase - 1]}`);
}

const list = async(msg, args) => {
	let res = "use command \"bet amount #\" to place bet\n";
	for (let phrase in phraseList)
		res += `${parseInt(phrase)+1}: ${phraseList[phrase]}\n`;
	msg.channel.send(res)
}

const rules = async(msg, args) => {
	msg.channel.send(`:purple_circle: purplebot126 v${version} gamerules :purple_circle:
- daily 75 coin claim available every 12 hours
- if you haven't placed a bet you lose 50 coins
- the minimum bet amount is 25 coins
- all coins reset at end of month
- #1 top is the winner of the month`);
}

let commands = "set, get, kill, bal, top, give, daily, bet, list, rules, about";
const about = async(msg, args) => {
	msg.channel.send(`:purple_circle: purplebot126 v${version} :purple_circle:
if something breaks, pls tell luigi
source code at <https://github.com/lilweege/purplebot>`);
}

const help = async(msg, args) => {
	msg.channel.send(`Commands: ${commands}`);
}

const prefix = '&';
client.once('ready', async() => {
	console.log(`client ready as ${client.user.tag}`);
	client.user.setActivity(`${prefix}help`, {type: "PLAYING"});
	restartTimeout();
});

client.on('message', msg => {
	if (!msg.content.startsWith(prefix) || msg.author.bot)
		return;
	const args = msg.content.slice(prefix.length).split(/ +/);
	const cmd = args.shift().toLowerCase();
	
	switch (cmd) {
		// testing
		// case '126': triggerEvent(); break;
		// admin
		case 'set': set(msg, args); break;
		case 'get': get(msg, args); break;
		case 'kill': kill(msg, args); break;
		// currency
		case 'bal': bal(msg, args); break;
		case 'top': top(msg, args); break;
		case 'give': give(msg, args); break;
		case 'daily': daily(msg, args); break;
		// betting
		case 'bet': bet(msg, args); break;
		case 'list': list(msg, args); break;
		case 'rules': rules(msg, args); break;
		// help
		case 'about': about(msg, rules); break;
		case 'help': help(msg, rules); break;
		default:
			msg.channel.send(`Invalid command, try ${prefix}help`);
			break;
	}
});


client.login(process.env.TOKEN);
