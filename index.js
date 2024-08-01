import express from 'express';
import cors from 'cors';
import { IgApiClient } from 'instagram-private-api';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ig = new IgApiClient();

async function login() {
    ig.state.generateDevice(process.env.INSTAGRAM_USERNAME);
    try {
        await ig.account.login(process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD);
        console.log('Login successful');
    } catch (error) {
        console.error('Error during login:', error.message);
        throw error;
    }
}

async function getMediaIdFromUrl(url) {
    const regex = /\/p\/([^/]+)\//;
    const match = url.match(regex);
    if (match) {
        const shortcode = match[1];
        try {
            const { data } = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`);
            console.log("Full response data:", data);
            if (data && data.graphql && data.graphql.shortcode_media) {
                return data.graphql.shortcode_media.id;
            } else {
                console.error("Invalid response structure:", data);
                throw new Error('Invalid response structure');
            }
        } catch (error) {
            console.error('Error fetching media ID:', error.message);
            throw error;
        }
    } else {
        throw new Error('Invalid URL');
    }
}

async function getComments(mediaId) {
    const comments = [];
    try {
        const commentsFeed = ig.feed.mediaComments(mediaId);
        do {
            const items = await commentsFeed.items();
            comments.push(...items);
        } while (commentsFeed.isMoreAvailable());
    } catch (error) {
        console.error('Error fetching comments:', error.message);
    }
    return comments;
}

async function sendDirectMessage(userId, message) {
    try {
        const thread = ig.entity.directThread([userId.toString()]);
        await thread.broadcastText(message);
    } catch (error) {
        console.error('Error sending direct message:', error.message);
    }
}

async function fetchMessageFromFirebase() {
    try {
        const { data } = await axios.get('https://chatbot-e4c87-default-rtdb.firebaseio.com/PesanInstagramBot.json');
        return data.message; // Sesuaikan dengan struktur data yang ada di Firebase
    } catch (error) {
        console.error('Error fetching message from Firebase:', error.message);
        throw error;
    }
}

async function fetchTargetPostUrlFromFirebase() {
    try {
        const { data } = await axios.get('https://chatbot-e4c87-default-rtdb.firebaseio.com/targetUrlInstagram.json');
        console.log('Fetched target post URL:', data);
        return data.url; // Sesuaikan dengan struktur data yang ada di Firebase
    } catch (error) {
        console.error('Error fetching target post URL from Firebase:', error.message);
        throw error;
    }
}

async function checkComments() {
    await login();

    try {
        const targetPostUrl = await fetchTargetPostUrlFromFirebase(); // Fetch target URL from Firebase
        if (!targetPostUrl) {
            throw new Error('targetPostUrl is undefined or empty');
        }
        console.log('Using target post URL:', targetPostUrl);
        const mediaId = await getMediaIdFromUrl(targetPostUrl);
        const comments = await getComments(mediaId);
        const message = await fetchMessageFromFirebase(); // Ambil pesan dari Firebase
        for (const comment of comments) {
            if (comment.text.toLowerCase().includes('mau')) {
                await sendDirectMessage(comment.user_id, message); // Gunakan pesan dari Firebase
                console.log(`Pesan terkirim ke: ${comment.user.username}`);
            }
        }
    } catch (error) {
        console.error('Error in checkComments:', error.message);
    }
}

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    res.send("Hello World");
});

app.listen(6000, () => {
    console.log("Server is running on port 6000");
    checkComments();
});
