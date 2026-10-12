// Retained upstream tiktoken implementation; research slice, AGPL-3.0.
import express from 'express';
import tiktoken from 'tiktoken';
import { Buffer } from 'node:buffer';
const tokenizersCache = {};

export const TEXT_COMPLETION_MODELS = [
    'gpt-3.5-turbo-instruct',
    'gpt-3.5-turbo-instruct-0914',
    'text-davinci-003',
    'text-davinci-002',
    'text-davinci-001',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
    'code-davinci-002',
    'code-davinci-001',
    'code-cushman-002',
    'code-cushman-001',
    'text-davinci-edit-001',
    'code-davinci-edit-001',
    'text-embedding-ada-002',
    'text-similarity-davinci-001',
    'text-similarity-curie-001',
    'text-similarity-babbage-001',
    'text-similarity-ada-001',
    'text-search-davinci-doc-001',
    'text-search-curie-doc-001',
    'text-search-babbage-doc-001',
    'text-search-ada-doc-001',
    'code-search-babbage-code-001',
    'code-search-ada-code-001',
];

const BYTES_PER_TOKEN = 3.35;

function guesstimate(str) {
    const byteLength = Buffer.byteLength(str, 'utf8');
    return Math.ceil(byteLength / BYTES_PER_TOKEN);
}

async function getTiktokenChunks(tokenizer, ids) {
    const decoder = new TextDecoder();
    const chunks = [];

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const chunkTextBytes = await tokenizer.decode(new Uint32Array([id]));
        const chunkText = decoder.decode(chunkTextBytes);
        chunks.push(chunkText);
    }

    return chunks;
}

export function getTokenizerModel(requestModel) {
    if (requestModel === 'o1' || requestModel.includes('o1-preview') || requestModel.includes('o1-mini') || requestModel.includes('o3-mini')) {
        return 'o1';
    }

    if (requestModel.includes('gpt-5') || requestModel.includes('gpt-6-astra') || requestModel.includes('o3') || requestModel.includes('o4-mini')) {
        return 'o1';
    }

    if (requestModel.includes('gpt-4o') || requestModel.includes('chatgpt-4o-latest')) {
        return 'gpt-4o';
    }

    if (requestModel.includes('gpt-4.1') || requestModel.includes('gpt-4.5')) {
        return 'gpt-4o';
    }

    if (requestModel.includes('gpt-4-32k')) {
        return 'gpt-4-32k';
    }

    if (requestModel.includes('gpt-4')) {
        return 'gpt-4';
    }

    if (requestModel.includes('gpt-3.5-turbo-0301')) {
        return 'gpt-3.5-turbo-0301';
    }

    if (requestModel.includes('gpt-3.5-turbo')) {
        return 'gpt-3.5-turbo';
    }

    if (TEXT_COMPLETION_MODELS.includes(requestModel)) {
        return requestModel;
    }

    if (requestModel.includes('claude')) {
        return 'claude';
    }

    if (requestModel.includes('llama3') || requestModel.includes('llama-3')) {
        return 'llama3';
    }

    if (requestModel.includes('llama')) {
        return 'llama';
    }

    if (requestModel.includes('mistral')) {
        return 'mistral';
    }

    if (requestModel.includes('yi')) {
        return 'yi';
    }

    if (requestModel.includes('deepseek')) {
        return 'deepseek';
    }

    if (requestModel.includes('gemma') || requestModel.includes('gemini') || requestModel.includes('learnlm')) {
        return 'gemma';
    }

    if (requestModel.includes('jamba')) {
        return 'jamba';
    }

    if (requestModel.includes('qwen2')) {
        return 'qwen2';
    }

    if (requestModel.includes('command-r')) {
        return 'command-r';
    }

    if (requestModel.includes('command-a')) {
        return 'command-a';
    }

    if (requestModel.includes('nemo')) {
        return 'nemo';
    }

    // default
    return 'gpt-3.5-turbo';
}

export function getTiktokenTokenizer(model) {
    if (tokenizersCache[model]) {
        return tokenizersCache[model];
    }

    const tokenizer = tiktoken.encoding_for_model(model);
    console.info('Instantiated the tokenizer for', model);
    tokenizersCache[model] = tokenizer;
    return tokenizer;
}

function createTiktokenEncodingHandler(modelId) {
    /**
     * Request handler for encoding Tiktoken tokens.
     * @param {import('express').Request} request
     * @param {import('express').Response} response
     */
    return async function (request, response) {
        try {
            if (!request.body) {
                return response.sendStatus(400);
            }

            const text = request.body.text || '';
            const tokenizer = getTiktokenTokenizer(modelId);
            const tokens = Object.values(tokenizer.encode(text));
            const chunks = await getTiktokenChunks(tokenizer, tokens);
            return response.send({ ids: tokens, count: tokens.length, chunks });
        } catch (error) {
            console.error(error);
            return response.send({ ids: [], count: 0, chunks: [] });
        }
    };
}

function createTiktokenDecodingHandler(modelId) {
    /**
     * Request handler for decoding Tiktoken tokens.
     * @param {import('express').Request} request
     * @param {import('express').Response} response
     */
    return async function (request, response) {
        try {
            if (!request.body) {
                return response.sendStatus(400);
            }

            const ids = request.body.ids || [];
            const tokenizer = getTiktokenTokenizer(modelId);
            const textBytes = tokenizer.decode(new Uint32Array(ids));
            const text = new TextDecoder().decode(textBytes);
            return response.send({ text });
        } catch (error) {
            console.error(error);
            return response.send({ text: '' });
        }
    };
}

export const router = express.Router();
router.use((req,res,next)=>{const model=String(req.query.model||'');if(!req.path.startsWith('/openai/') || model && !/^(gpt-|o[134])/.test(model))return res.status(422).json({error:'Only OpenAI tiktoken tokenization is retained'});next();});

router.post('/openai/encode', async function (req, res) {
    try {
        const queryModel = String(req.query.model || '');

        

        

        

        

        

        

        

        

        

        

        

        

        const model = getTokenizerModel(queryModel);
        const handler = createTiktokenEncodingHandler(model);
        return handler(req, res);
    } catch (error) {
        console.error(error);
        return res.send({ ids: [], count: 0, chunks: [] });
    }
});

router.post('/openai/decode', async function (req, res) {
    try {
        const queryModel = String(req.query.model || '');

        

        

        

        

        

        

        

        

        

        

        

        

        const model = getTokenizerModel(queryModel);
        const handler = createTiktokenDecodingHandler(model);
        return handler(req, res);
    } catch (error) {
        console.error(error);
        return res.send({ text: '' });
    }
});

router.post('/openai/count', async function (req, res) {
    try {
        if (!req.body) return res.sendStatus(400);

        let num_tokens = 0;
        const queryModel = String(req.query.model || '');
        const model = getTokenizerModel(queryModel);

        

        

        

        

        

        

        

        

        

        

        

        

        const tokensPerName = queryModel.includes('gpt-3.5-turbo-0301') ? -1 : 1;
        const tokensPerMessage = queryModel.includes('gpt-3.5-turbo-0301') ? 4 : 3;
        const tokensPadding = 3;

        const tokenizer = getTiktokenTokenizer(model);

        for (const msg of req.body) {
            try {
                num_tokens += tokensPerMessage;
                for (const [key, value] of Object.entries(msg)) {
                    num_tokens += tokenizer.encode(value).length;
                    if (key == 'name') {
                        num_tokens += tokensPerName;
                    }
                }
            } catch {
                console.warn('Error tokenizing message:', msg);
            }
        }
        num_tokens += tokensPadding;

        // NB: Since 2023-10-14, the GPT-3.5 Turbo 0301 model shoves in 7-9 extra tokens to every message.
        // More details: https://community.openai.com/t/gpt-3-5-turbo-0301-showing-different-behavior-suddenly/431326/14
        if (queryModel.includes('gpt-3.5-turbo-0301')) {
            num_tokens += 9;
        }

        // not needed for cached tokenizers
        //tokenizer.free();

        res.send({ 'token_count': num_tokens });
    } catch (error) {
        console.error('An error counting tokens, using fallback estimation method', error);
        const jsonBody = JSON.stringify(req.body);
        const num_tokens = guesstimate(jsonBody);
        res.send({ 'token_count': num_tokens });
    }
});