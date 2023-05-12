import dotenv from 'dotenv';
import { ChatGPTAPI } from "chatgpt";
import minimist from 'minimist';
import fs from 'fs';
import express from 'express';

dotenv.config();

const app = express();
const apiKey = process.env.API_KEY;
const argv = minimist(process.argv.slice(2));

const model = argv.model || "gpt-4";
const NUM_ASKS = argv.numAsks || 3;
const logging = argv.logging || false;

function sanitizeFilename(input) {
    return input.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/process', async (req, res) => {
    const prompt = req.body.prompt;
    const responses = await Promise.all(requests);
    try {
        const api = new ChatGPTAPI({
            apiKey: apiKey,
            completionParams: {
                model: model,
            },
        });

        if (logging) {
            console.log(`Asking ${model} for ${NUM_ASKS} responses to prompt: "${prompt}"`);
        }

        let requests = [];
        for (let i = 0; i < NUM_ASKS; i++) {
            requests.push(api.sendMessage(`Question: ${prompt} \n\n Answer: Let's work this out in a step by step way to be sure we have the right answer.`));
        }

        const responses = await Promise.all(requests);

        const researcherPrompt = responses.reduce((acc, currentResponse, idx) => {
            return acc + `Answer Option ${idx+1}: ${currentResponse.text} \n\n`;
        }, `Question: ${prompt} \n\n `) 
        + `You are a researcher tasked with investigating the ${NUM_ASKS} response options provided. List the flaws and faulty logic of each answer option. Let's work this out in a step by step way to be sure we have all the errors:`;

        if (logging) {
            console.log(`Researcher prompt: ${researcherPrompt}`);
        }

        const researcherResponse = await api.sendMessage(researcherPrompt);

        if (logging) {
            console.log(`Researcher Response: ${researcherResponse.text}`);
        }

        const researcherId = researcherResponse.id;

        const resolverPrompt = `You are a resolver tasked with 1) finding which of the ${NUM_ASKS} answer options the researcher thought was best 2) improving that answer, and 3) Printing the improved answer in full. Let's work this out in a step by step way to be sure we have the right answer:`;

        const resolverResponse = await api.sendMessage(resolverPrompt, {
            parentMessageId: researcherId,
        });

        console.log(`Resolver Response: ${resolverResponse.text}`);

        const timestamp = Date.now();
        const sanitizedPrompt = sanitizeFilename(prompt);
        const filename = `./output/${timestamp}_${sanitizedPrompt}.txt`;
        const data = [prompt, researcherPrompt, researcherResponse.text, resolverPrompt, resolverResponse.text].join("\n\n");
        //make output directory 
        fs.mkdirSync("./output", { recursive: true });
        fs.writeFileSync(filename, data);
    }
        if (logging) {
            console.log(`Wrote output to ${filename}`);
        }

        res.send(resolverResponse.text);
    } catch (error) {
        console.error(error);
        res.status(500)
    }