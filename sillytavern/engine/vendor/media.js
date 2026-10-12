// SillyTavern fixed SHA 06bde939f, AGPL-3.0. Extracted original media functions.
function getWaveFile(audio) {
    const wav = new wavefile.WaveFile();
    wav.fromDataURI(audio);
    wav.toBitDepth('32f');
    wav.toSampleRate(16000);
    let audioData = wav.getSamples();
    if (Array.isArray(audioData)) {
        if (audioData.length > 1) {
            const SCALING_FACTOR = Math.sqrt(2);

            // Merge channels (into first channel to save memory)
            for (let i = 0; i < audioData[0].length; ++i) {
                audioData[0][i] = SCALING_FACTOR * (audioData[0][i] + audioData[1][i]) / 2;
            }
        }

        // Select first channel
        audioData = audioData[0];
    }

    return audioData;
}
const recognizeHandler = async (req, res) => {
    try {
        const TASK = 'automatic-speech-recognition';
        const { model, audio, lang } = req.body;
        const pipe = await getPipeline(TASK, model);
        const wav = getWaveFile(audio);
        const start = performance.now();
        const result = await pipe(wav, { language: lang || null, task: 'transcribe' });
        const end = performance.now();
        console.info(`Execution duration: ${(end - start) / 1000} seconds`);
        console.info('Transcribed audio:', result.text);

        return res.json({ text: result.text });
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
};
const synthesizeHandler = async (req, res) => {
    try {
        const TASK = 'text-to-speech';
        const { text, model, speaker } = req.body;
        const pipe = await getPipeline(TASK, model);
        const speaker_embeddings = speaker
            ? new Float32Array(new Uint8Array(Buffer.from(speaker.startsWith('data:') ? speaker.split(',')[1] : speaker, 'base64')).buffer)
            : null;
        const start = performance.now();
        const result = await pipe(text, { speaker_embeddings: speaker_embeddings });
        const end = performance.now();
        console.debug(`Execution duration: ${(end - start) / 1000} seconds`);

        const wav = new wavefile.WaveFile();
        wav.fromScratch(1, result.sampling_rate, '32f', result.audio);
        const buffer = wav.toBuffer();

        res.set('Content-Type', 'audio/wav');
        return res.send(Buffer.from(buffer));
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
};
const captionHandler = async (req, res) => {
    try {
        const { image } = req.body;

        const rawImage = await getRawImage(image);

        if (!rawImage) {
            console.warn('Failed to parse captioned image');
            return res.sendStatus(400);
        }

        const pipe = await getPipeline(TASK);
        const result = await pipe(rawImage);
        const text = result[0].generated_text;
        console.info('Image caption:', text);

        return res.json({ caption: text });
    } catch (error) {
        console.error(error);
        return res.sendStatus(500);
    }
};
const ttsHandler = async (request, response) => {
    try {
        const key = readSecret(request.user.directories, SECRET_KEYS.CUSTOM_OPENAI_TTS);
        const { input, provider_endpoint, response_format, voice, speed, model } = request.body;

        if (!provider_endpoint) {
            console.warn('No OpenAI-compatible TTS provider endpoint provided');
            return response.sendStatus(400);
        }

        const result = await fetch(provider_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key ?? ''}`,
            },
            body: JSON.stringify({
                input: input ?? '',
                response_format: response_format ?? 'mp3',
                voice: voice ?? 'alloy',
                speed: speed ?? 1,
                model: model ?? 'tts-1',
            }),
        });

        if (!result.ok) {
            const text = await result.text();
            console.warn('OpenAI request failed', result.statusText, text);
            return response.status(500).send(text);
        }

        const buffer = await result.arrayBuffer();
        response.setHeader('Content-Type', 'audio/mpeg');
        return response.send(Buffer.from(buffer));
    } catch (error) {
        console.error('OpenAI TTS generation failed', error);
        response.status(500).send('Internal server error');
    }
};
class OpenAICompatibleTtsProvider {
    settings;
    voices = [];
    separator = ' . ';

    audioElement = document.createElement('audio');

    defaultSettings = {
        voiceMap: {},
        model: 'tts-1',
        speed: 1,
        available_voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        provider_endpoint: 'http://127.0.0.1:8000/v1/audio/speech',
    };

    get settingsHtml() {
        let html = `
        <label for="openai_compatible_tts_endpoint">Provider Endpoint:</label>
        <div class="flex-container alignItemsCenter">
            <div class="flex1">
                <input id="openai_compatible_tts_endpoint" type="text" class="text_pole" maxlength="500" value="${this.defaultSettings.provider_endpoint}"/>
            </div>
            <div id="openai_compatible_tts_key" class="menu_button menu_button_icon manage-api-keys" data-key="api_key_custom_openai_tts">
                <i class="fa-solid fa-key"></i>
                <span>API Key</span>
            </div>
        </div>
        <label for="openai_compatible_model">Model:</label>
        <input id="openai_compatible_model" type="text" class="text_pole" maxlength="500" value="${this.defaultSettings.model}"/>
        <label for="openai_compatible_tts_voices">Available Voices (comma separated):</label>
        <input id="openai_compatible_tts_voices" type="text" class="text_pole" value="${this.defaultSettings.available_voices.join()}"/>
        <label for="openai_compatible_tts_speed">Speed: <span id="openai_compatible_tts_speed_output"></span></label>
        <input type="range" id="openai_compatible_tts_speed" value="1" min="0.25" max="4" step="0.05">`;
        return html;
    }

    constructor() {
        this.handler = async function (/** @type {string} */ key) {
            if (key !== SECRET_KEYS.CUSTOM_OPENAI_TTS) return;
            $('#openai_compatible_tts_key').toggleClass('success', !!secret_state[SECRET_KEYS.CUSTOM_OPENAI_TTS]);
            await this.onRefreshClick();
        }.bind(this);
    }

    dispose() {
        [event_types.SECRET_WRITTEN, event_types.SECRET_DELETED, event_types.SECRET_ROTATED].forEach(event => {
            eventSource.removeListener(event, this.handler);
        });
    }

    async loadSettings(settings) {
        // Populate Provider UI given input settings
        if (Object.keys(settings).length == 0) {
            console.info('Using default TTS Provider settings');
        }

        // Only accept keys defined in defaultSettings
        this.settings = this.defaultSettings;

        for (const key in settings) {
            if (key in this.settings) {
                this.settings[key] = settings[key];
            } else {
                throw `Invalid setting passed to TTS Provider: ${key}`;
            }
        }

        $('#openai_compatible_tts_endpoint').val(this.settings.provider_endpoint);
        $('#openai_compatible_tts_endpoint').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_model').val(this.defaultSettings.model);
        $('#openai_compatible_model').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_voices').val(this.settings.available_voices.join());
        $('#openai_compatible_tts_voices').on('input', () => { this.onSettingsChange(); });

        $('#openai_compatible_tts_speed').val(this.settings.speed);
        $('#openai_compatible_tts_speed').on('input', () => {
            this.onSettingsChange();
        });

        $('#openai_compatible_tts_speed_output').text(this.settings.speed);

        $('#openai_compatible_tts_key').toggleClass('success', !!secret_state[SECRET_KEYS.CUSTOM_OPENAI_TTS]);
        [event_types.SECRET_WRITTEN, event_types.SECRET_DELETED, event_types.SECRET_ROTATED].forEach(event => {
            eventSource.on(event, this.handler);
        });

        await this.checkReady();

        console.debug('OpenAI Compatible TTS: Settings loaded');
    }

    onSettingsChange() {
        // Update dynamically
        this.settings.provider_endpoint = String($('#openai_compatible_tts_endpoint').val());
        this.settings.model = String($('#openai_compatible_model').val());
        this.settings.available_voices = String($('#openai_compatible_tts_voices').val()).split(',');
        this.settings.speed = Number($('#openai_compatible_tts_speed').val());
        $('#openai_compatible_tts_speed_output').text(this.settings.speed);
        saveTtsProviderSettings();
    }

    async checkReady() {
        this.voices = await this.fetchTtsVoiceObjects();
    }

    async onRefreshClick() {
        return;
    }

    async getVoice(voiceName) {
        if (this.voices.length == 0) {
            this.voices = await this.fetchTtsVoiceObjects();
        }
        const match = this.voices.filter(
            oaicVoice => oaicVoice.name == voiceName,
        )[0];
        if (!match) {
            throw `TTS Voice name ${voiceName} not found`;
        }
        return match;
    }

    async generateTts(text, voiceId) {
        const response = await this.fetchTtsGeneration(text, voiceId);
        return response;
    }

    async fetchTtsVoiceObjects() {
        return this.settings.available_voices.map(v => {
            return { name: v, voice_id: v, lang: 'en-US' };
        });
    }

    async previewTtsVoice(voiceId) {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;

        const text = getPreviewString('en-US');
        const response = await this.fetchTtsGeneration(text, voiceId);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const audio = await response.blob();
        const url = URL.createObjectURL(audio);
        this.audioElement.src = url;
        this.audioElement.play();
        this.audioElement.onended = () => URL.revokeObjectURL(url);
    }

    async fetchTtsGeneration(inputText, voiceId) {
        console.info(`Generating new TTS for voice_id ${voiceId}`);
        const response = await fetch('/api/openai/custom/generate-voice', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                provider_endpoint: this.settings.provider_endpoint,
                model: this.settings.model,
                input: inputText,
                voice: voiceId,
                response_format: 'mp3',
                speed: this.settings.speed,
            }),
        });

        if (!response.ok) {
            toastr.error(response.statusText, 'TTS Generation Failed');
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        return response;
    }
}
const sources = {
    extras: 'extras',
    horde: 'horde',
    auto: 'auto',
    sdcpp: 'sdcpp',
    novel: 'novel',
    vlad: 'vlad',
    openai: 'openai',
    aimlapi: 'aimlapi',
    comfy: 'comfy',
    togetherai: 'togetherai',
    drawthings: 'drawthings',
    pollinations: 'pollinations',
    stability: 'stability',
    huggingface: 'huggingface',
    chutes: 'chutes',
    electronhub: 'electronhub',
    nanogpt: 'nanogpt',
    bfl: 'bfl',
    falai: 'falai',
    xai: 'xai',
    google: 'google',
    zai: 'zai',
    openrouter: 'openrouter',
    workersai: 'workersai',
};
const comfyTypes = {
    standard: 'standard',
    runpod_serverless: 'runpod_serverless',
};
const generationMode = {
    TOOL: -2,
    MESSAGE: -1,
    CHARACTER: 0,
    USER: 1,
    SCENARIO: 2,
    RAW_LAST: 3,
    NOW: 4,
    FACE: 5,
    FREE: 6,
    BACKGROUND: 7,
    CHARACTER_MULTIMODAL: 8,
    USER_MULTIMODAL: 9,
    FACE_MULTIMODAL: 10,
    FREE_EXTENDED: 11,
};
const promptTemplates = {
    // Not really a prompt template, rather an outcome message template and function tool prompt
    [generationMode.MESSAGE]: '[{{char}} sends a picture that contains: {{prompt}}].',
    [generationMode.TOOL]: [
        'The text prompt used to generate the image.',
        'Must represent an exhaustive description of the desired image that will allow an artist or a photographer to perfectly recreate it.',
    ].join(' '),
    [generationMode.CHARACTER]: 'In the next response I want you to provide only a detailed comma-delimited list of keywords and phrases which describe {{char}}. The list must include all of the following items in this order: name, species and race, gender, age, clothing, occupation, physical features and appearances. Do not include descriptions of non-visual qualities such as personality, movements, scents, mental traits, or anything which could not be seen in a still photograph. Do not write in full sentences. Prefix your description with the phrase \'full body portrait,\'',
    //face-specific prompt
    [generationMode.FACE]: 'In the next response I want you to provide only a detailed comma-delimited list of keywords and phrases which describe {{char}}. The list must include all of the following items in this order: name, species and race, gender, age, facial features and expressions, occupation, hair and hair accessories (if any), what they are wearing on their upper body (if anything). Do not describe anything below their neck. Do not include descriptions of non-visual qualities such as personality, movements, scents, mental traits, or anything which could not be seen in a still photograph. Do not write in full sentences. Prefix your description with the phrase \'close up facial portrait,\'',
    //prompt for only the last message
    [generationMode.USER]: 'Ignore previous instructions and provide a detailed description of {{user}}\'s physical appearance from the perspective of {{char}} in the form of a comma-delimited list of keywords and phrases. The list must include all of the following items in this order: name, species and race, gender, age, clothing, occupation, physical features and appearances. Do not include descriptions of non-visual qualities such as personality, movements, scents, mental traits, or anything which could not be seen in a still photograph. Do not write in full sentences. Prefix your description with the phrase \'full body portrait,\'. Ignore the rest of the story when crafting this description. Do not reply as {{char}} when writing this description, and do not attempt to continue the story.',
    [generationMode.SCENARIO]: 'Ignore previous instructions and provide a detailed description for all of the following: a brief recap of recent events in the story, {{char}}\'s appearance, and {{char}}\'s surroundings. Do not reply as {{char}} while writing this description.',

    [generationMode.NOW]: `Ignore previous instructions. Your next response must be formatted as a single comma-delimited list of concise keywords.  The list will describe of the visual details included in the last chat message.

    Only mention characters by using pronouns ('he','his','she','her','it','its') or neutral nouns ('male', 'the man', 'female', 'the woman').

    Ignore non-visible things such as feelings, personality traits, thoughts, and spoken dialog.

    Add keywords in this precise order:
    a keyword to describe the location of the scene,
    a keyword to mention how many characters of each gender or type are present in the scene (minimum of two characters:
    {{user}} and {{char}}, example: '2 men ' or '1 man 1 woman ', '1 man 3 robots'),

    keywords to describe the relative physical positioning of the characters to each other (if a commonly known term for the positioning is known use it instead of describing the positioning in detail) + 'POV',

    a single keyword or phrase to describe the primary act taking place in the last chat message,

    keywords to describe {{char}}'s physical appearance and facial expression,
    keywords to describe {{char}}'s actions,
    keywords to describe {{user}}'s physical appearance and actions.

    If character actions involve direct physical interaction with another character, mention specifically which body parts interacting and how.

    A correctly formatted example response would be:
    '(location),(character list by gender),(primary action), (relative character position) POV, (character 1's description and actions), (character 2's description and actions)'`,

    [generationMode.RAW_LAST]: 'Ignore previous instructions and provide ONLY the last chat message string back to me verbatim. Do not write anything after the string. Do not reply as {{char}} when writing this description, and do not attempt to continue the story.',
    [generationMode.BACKGROUND]: 'Ignore previous instructions and provide a detailed description of {{char}}\'s surroundings in the form of a comma-delimited list of keywords and phrases. The list must include all of the following items in this order: location, time of day, weather, lighting, and any other relevant details. Do not include descriptions of characters and non-visual qualities such as names, personality, movements, scents, mental traits, or anything which could not be seen in a still photograph. Do not write in full sentences. Prefix your description with the phrase \'background,\'. Ignore the rest of the story when crafting this description. Do not reply as {{char}} when writing this description, and do not attempt to continue the story.',
    [generationMode.FACE_MULTIMODAL]: 'Provide an exhaustive comma-separated list of tags describing the appearance of the character on this image in great detail. Start with "close-up portrait".',
    [generationMode.CHARACTER_MULTIMODAL]: 'Provide an exhaustive comma-separated list of tags describing the appearance of the character on this image in great detail. Start with "full body portrait".',
    [generationMode.USER_MULTIMODAL]: 'Provide an exhaustive comma-separated list of tags describing the appearance of the character on this image in great detail. Start with "full body portrait".',
    [generationMode.FREE_EXTENDED]: 'Ignore previous instructions and provide an exhaustive comma-separated list of tags describing the appearance of "{0}" in great detail. Start with {{charPrefix}} (sic) if the subject is associated with {{char}}.',
};
const defaultPrefix = 'best quality, absurdres, aesthetic,';
const defaultNegative = 'lowres, bad anatomy, bad hands, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry';
const defaultStyles = [
    {
        name: 'Default',
        negative: defaultNegative,
        prefix: defaultPrefix,
    },
];
const placeholderVae = 'Automatic';
const defaultSettings = {
    source: sources.extras,

    // CFG Scale
    scale_min: 1,
    scale_max: 30,
    scale_step: 0.1,
    scale: 7,

    // Sampler steps
    steps_min: 1,
    steps_max: 150,
    steps_step: 1,
    steps: 20,

    // Scheduler
    scheduler: 'normal',

    // Image dimensions (Width & Height)
    dimension_min: 64,
    dimension_max: 2048,
    dimension_step: 64,
    width: 512,
    height: 512,

    prompt_prefix: defaultPrefix,
    negative_prompt: defaultNegative,
    sampler: 'DDIM',
    model: '',
    vae: '',
    seed: -1,

    // Automatic1111/Horde exclusives
    restore_faces: false,
    enable_hr: false,
    adetailer_face: false,

    // Horde settings
    horde: false,
    horde_nsfw: false,
    horde_karras: true,
    horde_sanitize: true,

    // Refine mode
    refine_mode: false,
    interactive_mode: false,
    multimodal_captioning: false,
    snap: false,
    free_extend: false,
    function_tool: false,
    minimal_prompt_processing: false,

    prompts: promptTemplates,

    // AUTOMATIC1111 settings
    auto_url: 'http://localhost:7860',
    auto_auth: '',

    // stable-diffusion.cpp settings
    sdcpp_url: 'http://127.0.0.1:1234',

    vlad_url: 'http://localhost:7860',
    vlad_auth: '',

    drawthings_url: 'http://localhost:7860',
    drawthings_auth: '',

    hr_upscaler: 'Latent',
    hr_scale: 1.0,
    hr_scale_min: 1.0,
    hr_scale_max: 4.0,
    hr_scale_step: 0.1,
    denoising_strength: 0.7,
    denoising_strength_min: 0.0,
    denoising_strength_max: 1.0,
    denoising_strength_step: 0.01,
    hr_second_pass_steps: 0,
    hr_second_pass_steps_min: 0,
    hr_second_pass_steps_max: 150,
    hr_second_pass_steps_step: 1,

    // CLIP skip
    clip_skip_min: 1,
    clip_skip_max: 12,
    clip_skip_step: 1,
    clip_skip: 1,

    // NovelAI settings
    novel_anlas_guard: false,
    novel_sm: false,
    novel_sm_dyn: false,
    novel_decrisper: false,
    novel_variety_boost: false,

    // OpenAI settings
    openai_style: 'vivid',
    openai_quality: 'standard',
    openai_quality_gpt: 'auto',
    openai_duration: '8',

    style: 'Default',
    styles: defaultStyles,

    // ComyUI settings
    comfy_type: 'standard',

    comfy_url: 'http://127.0.0.1:8188',
    comfy_workflow: 'Default_Comfy_Workflow.json',

    comfy_runpod_url: '',

    // Pollinations settings
    pollinations_enhance: false,

    // Visibility toggles
    wand_visible: false,
    command_visible: false,
    interactive_visible: false,
    tool_visible: false,

    // Stability AI settings
    stability_style_preset: 'anime',

    // BFL API settings
    bfl_upsampling: false,

    // Google settings
    google_api: 'makersuite',
    google_enhance: true,
    google_duration: 6,
};
function getSdRequestBody() {
    switch (extension_settings.sd.source) {
        case sources.vlad:
            return { url: extension_settings.sd.vlad_url, auth: extension_settings.sd.vlad_auth };
        case sources.auto:
            return { url: extension_settings.sd.auto_url, auth: extension_settings.sd.auto_auth };
        case sources.drawthings:
            return { url: extension_settings.sd.drawthings_url, auth: extension_settings.sd.drawthings_auth };
        default:
            throw new Error('Invalid SD source.');
    }
}
function processReply(str) {
    if (!str) {
        return '';
    }

    if (extension_settings.sd.minimal_prompt_processing) {
        // Minimal prompt processing
        // JSON and similar should be preserved
        str = str.normalize('NFD');
        str = str.replace(/\s+/g, ' '); // Collapse multiple whitespaces into one
        str = str.trim();
        return str;
    }

    str = str.replaceAll('"', '');
    str = str.replaceAll('“', '');
    str = str.replaceAll('\n', ', ');
    str = str.normalize('NFD');

    // Strip out non-alphanumeric characters barring model syntax exceptions
    str = str.replace(/[^a-zA-Z0-9.,:_(){}<>[\]/\-'|#]+/g, ' ');

    str = str.replace(/\s+/g, ' '); // Collapse multiple whitespaces into one
    str = str.trim();

    str = str
        .split(',') // list split by commas
        .map(x => x.trim()) // trim each entry
        .filter(x => x) // remove empty entries
        .join(', '); // join it back with proper spacing

    return str;
}
async function generatePrompt(quietPrompt) {
    const toast = toastr.info('Generating image prompt with an LLM...', 'Image Generation');
    const reply = await generateQuietPrompt({ quietPrompt });
    const processedReply = processReply(reply);
    toastr.clear(toast);

    if (!processedReply) {
        toastr.error('Prompt generation produced no text. Make sure you\'re using a valid instruct template and try again', 'Image Generation');
        throw new Error('Prompt generation failed.');
    }

    return processedReply;
}
async function generateAutoImage(prompt, negativePrompt, signal) {
    const isValidVae = extension_settings.sd.vae && !['N/A', placeholderVae].includes(extension_settings.sd.vae);
    let payload = {
        ...getSdRequestBody(),
        prompt: prompt,
        negative_prompt: negativePrompt,
        sampler_name: extension_settings.sd.sampler,
        scheduler: extension_settings.sd.scheduler,
        steps: extension_settings.sd.steps,
        cfg_scale: extension_settings.sd.scale,
        width: extension_settings.sd.width,
        height: extension_settings.sd.height,
        restore_faces: !!extension_settings.sd.restore_faces,
        enable_hr: !!extension_settings.sd.enable_hr,
        hr_upscaler: extension_settings.sd.hr_upscaler,
        hr_scale: extension_settings.sd.hr_scale,
        hr_additional_modules: [],
        denoising_strength: extension_settings.sd.denoising_strength,
        hr_second_pass_steps: extension_settings.sd.hr_second_pass_steps,
        seed: extension_settings.sd.seed >= 0 ? extension_settings.sd.seed : undefined,
        override_settings: {
            CLIP_stop_at_last_layers: extension_settings.sd.clip_skip,
            sd_vae: isValidVae ? extension_settings.sd.vae : undefined,
            forge_additional_modules: isValidVae ? [extension_settings.sd.vae] : undefined, // For SD Forge
        },
        override_settings_restore_afterwards: true,
        clip_skip: extension_settings.sd.clip_skip, // For SD.Next
        save_images: true,
        send_images: true,
        do_not_save_grid: false,
        do_not_save_samples: false,
    };

    // Conditionally add the ADetailer if adetailer_face is enabled
    if (extension_settings.sd.adetailer_face) {
        payload = deepMerge(payload, {
            alwayson_scripts: {
                ADetailer: {
                    args: [
                        true, // ad_enable
                        true, // skip_img2img
                        {
                            'ad_model': 'face_yolov8n.pt',
                        },
                    ],
                },
            },
        });
    }

    // Make the fetch call with the payload
    const result = await fetch('/api/sd/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        signal: signal,
        body: JSON.stringify(payload),
    });

    if (result.ok) {
        const data = await result.json();
        return { format: 'png', data: data.images[0] };
    } else {
        const text = await result.text();
        throw new Error(text);
    }
}
