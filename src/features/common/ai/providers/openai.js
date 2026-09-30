const OpenAI = require('openai');


class OpenAIProvider {
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string' || !key.startsWith('sk-')) {
            return { success: false, error: 'Invalid OpenAI API key format.' };
        }

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${key}` }, signal: AbortSignal.timeout(15000)
            });

            if (response.ok) {
                return { success: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData.error?.message || `Validation failed with status: ${response.status}`;
                return { success: false, error: message };
            }
        } catch (error) {
            console.error(`[OpenAIProvider] Network error during key validation:`, error);
            return { success: false, error: 'A network error occurred during validation.' };
        }
    }
}


/**
 * Creates an OpenAI STT session
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.language='en'] - Language code
 * @param {object} [opts.callbacks] - Event callbacks
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key
 * @returns {Promise<object>} STT session
 */
async function createSTT({ apiKey, usePortkey = false, portkeyVirtualKey, ...config }) {
  const { connectTranscription } = require('../realtimeTranscription');
  if (usePortkey) {
    throw new Error('Use a personal OpenAI key for Realtime transcription in this fork.');
  }
  return connectTranscription({
    ...config,
    url: 'wss://api.openai.com/v1/realtime?intent=transcription',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * Creates an OpenAI LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.model='gpt-4.1'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=2048] - Max tokens
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key
 * @returns {object} LLM instance
 */
function createLLM({ apiKey, model = 'gpt-4.1', temperature = 0.7, maxTokens = 2048, usePortkey = false, portkeyVirtualKey, ...config }) {
  const client = new OpenAI({ apiKey, timeout: 60000, maxRetries: 0 });
  
  const callApi = async (messages) => {
    if (!usePortkey) {
      const response = await client.chat.completions.create({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      }, { signal: config.signal });
      return {
        content: response.choices[0].message.content.trim(),
        raw: response
      };
    } else {
      const fetchUrl = 'https://api.portkey.ai/v1/chat/completions';
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
            'x-portkey-api-key': 'gRv2UGRMq6GGLJ8aVEB4e7adIewu',
            'x-portkey-virtual-key': portkeyVirtualKey || apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`Portkey API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        content: result.choices[0].message.content.trim(),
        raw: result
      };
    }
  };

  return {
    generateContent: async (parts) => {
      const messages = [];
      let systemPrompt = '';
      let userContent = [];
      
      for (const part of parts) {
        if (typeof part === 'string') {
          if (systemPrompt === '' && part.includes('You are')) {
            systemPrompt = part;
          } else {
            userContent.push({ type: 'text', text: part });
          }
        } else if (part.inlineData) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
          });
        }
      }
      
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      if (userContent.length > 0) messages.push({ role: 'user', content: userContent });
      
      const result = await callApi(messages);

      return {
        response: {
          text: () => result.content
        },
        raw: result.raw
      };
    },
    
    // For compatibility with chat-style interfaces
    chat: async (messages) => {
      return await callApi(messages);
    }
  };
}

/** 
 * Creates an OpenAI streaming LLM instance
 * @param {object} opts - Configuration options
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.model='gpt-4.1'] - Model name
 * @param {number} [opts.temperature=0.7] - Temperature
 * @param {number} [opts.maxTokens=2048] - Max tokens
 * @param {boolean} [opts.usePortkey=false] - Whether to use Portkey
 * @param {string} [opts.portkeyVirtualKey] - Portkey virtual key
 * @returns {object} Streaming LLM instance
 */
function createStreamingLLM({ apiKey, model = 'gpt-4.1', temperature = 0.7, maxTokens = 2048, usePortkey = false, portkeyVirtualKey, ...config }) {
  return {
    streamChat: async (messages) => {
      const fetchUrl = usePortkey 
        ? 'https://api.portkey.ai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      
      const headers = usePortkey
        ? {
            'x-portkey-api-key': 'gRv2UGRMq6GGLJ8aVEB4e7adIewu',
            'x-portkey-virtual-key': portkeyVirtualKey || apiKey,
            'Content-Type': 'application/json',
          }
        : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          };

      const response = await fetch(fetchUrl, {
        method: 'POST',
        signal: config.signal ? AbortSignal.any([config.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
        headers,
        body: JSON.stringify({
          model: model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      return response;
    }
  };
}

module.exports = {
    OpenAIProvider,
    createSTT,
    createLLM,
    createStreamingLLM
}; 