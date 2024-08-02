import express from 'express';
import cors from 'cors';
import { IgApiClient, IgCheckpointError } from 'instagram-private-api';
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
        if (error instanceof IgCheckpointError) {
            console.error('Checkpoint required. Please resolve the challenge manually.');
            throw error; // Handle checkpoint resolution manually
        } else {
            console.error('Error during login:', error);
            throw error;
        }
    }
}

async function getMediaIdFromUrl(url) {
    const regex = /\/p\/([^/?]+)/;
    const match = url.match(regex);
    if (match) {
        const shortcode = match[1];
        try {
            const { data } = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`);
            if (data && data.graphql && data.graphql.shortcode_media) {
                return data.graphql.shortcode_media.id;
            } else {
                console.error("Invalid response structure:", data);
                throw new Error('Invalid response structure');
            }
        } catch (error) {
            console.error('Error fetching media ID:', error);
            throw error;
        }
    } else {
        console.error('Invalid URL format:', url);
        throw new Error('Invalid URL');
    }
}

async function getComments(mediaId) {
    try {
        const commentsFeed = ig.feed.mediaComments(mediaId);
        const comments = await commentsFeed.items();
        return comments;
    } catch (error) {
        if (error instanceof IgCheckpointError) {
            console.error('Checkpoint required while fetching comments. Please resolve the challenge manually.');
            throw error; // Handle checkpoint resolution manually
        } else {
            console.error('Error fetching comments:', error);
            return [];
        }
    }
}

async function sendDirectMessage(userId, message) {
    try {
        const thread = ig.entity.directThread([userId.toString()]);
        await thread.broadcastText(message);
        console.log(`Message sent to user ID: ${userId}`);
    } catch (error) {
        if (error instanceof IgCheckpointError) {
            console.error('Checkpoint required while sending messages. Please resolve the challenge manually.');
            throw error; // Handle checkpoint resolution manually
        } else {
            console.error(`Error sending message to user ID ${userId}:`, error);
        }
    }
}

async function fetchMessageFromFirebase() {
    try {
        const { data } = await axios.get('https://chatbot-e4c87-default-rtdb.firebaseio.com/PesanInstagramBot.json');
        return data;
    } catch (error) {
        console.error('Error fetching message from Firebase:', error);
        throw error;
    }
}

async function fetchTargetPostUrlsFromFirebase() {
    try {
        const { data } = await axios.get('https://chatbot-e4c87-default-rtdb.firebaseio.com/targetUrlsInstagram.json');
        console.log('Fetched target post URLs:', data);
        return data;
    } catch (error) {
        console.error('Error fetching target post URLs from Firebase:', error);
        throw error;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkComments() {
    try {
        await login();

        const targetPostUrls = await fetchTargetPostUrlsFromFirebase();
        const messages = await fetchMessageFromFirebase();

        console.log('Target Post URLs:', targetPostUrls);
        console.log('Messages:', messages);

        for (let i = 1; i <= 10; i++) {
            const targetPostUrl = targetPostUrls[`url${i}`];
            const message = messages[`message${i}`];

            if (!targetPostUrl || !message) {
                console.warn(`No URL or message found for url${i} or message${i}`);
                continue;
            }

            console.log(`Using target URL: ${targetPostUrl}`);

            try {
                const mediaId = await getMediaIdFromUrl(targetPostUrl);
                const comments = await getComments(mediaId);

                for (const comment of comments) {
                    if (comment.text.toLowerCase().includes('mau')) {
                        await sendDirectMessage(comment.user.pk, message);
                        await delay(1000); // 1 second delay between messages
                    }
                }
            } catch (error) {
                console.error(`Error processing url${i}:`, error);
            }

            await delay(5000); // 5 seconds delay between posts
        }
    } catch (error) {
        console.error('Error in checkComments:', error);
    }
}

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    res.send("Instagram Bot Server Running");
});

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    checkComments();
});
