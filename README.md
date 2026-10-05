# Glass Meeting Assistant

A personal fork of [pickle-com/glass](https://github.com/pickle-com/glass), maintained at [fahmyfarahat/glass](https://github.com/fahmyfarahat/glass). Adds live answer suggestions and OpenAI / IONOS AI Model Hub / custom OpenAI-compatible API support. Original project history and credits are in [the upstream README](docs/UPSTREAM_README.md).

## Using it with Google Meet

Glass runs beside your meeting on your computer. It receives microphone and system audio; it does not join Meet as a bot. System audio can include other applications, so close unrelated audio sources. Headphones help separate your voice from other participants.

1. Launch **Glass Meeting Assistant** and choose **Enter Your API Key**.
2. Choose an answer provider. For **IONOS**, enter your token and API base URL, then use **Load available models** and select or type the exact model ID. The default base URL is `https://openai.inference.de-txl.ionos.com/v1`. Custom endpoints use the same setup. Confirming tests the connection with a small completion request.
3. Choose **OpenAI** as the speech provider and enter your OpenAI key. OpenAI also works as the answer provider. Existing local Whisper support remains available separately.
4. Grant the microphone and screen/system-audio permissions requested by macOS. Restart the app after changing Screen Recording permission if needed.
5. Join your Google Meet in your browser, click **Listen**, then enable **Suggest answers automatically** in the Listen panel. Suggestions appear after the other speaker finishes a question or request. **Suggest now** gives a manual response.
6. For screen context, open **Options**, click **Choose / refresh windows**, select the Meet window or a display, then enable **Include the selected screen**. You can add a short meeting background there too.
7. Click **Stop** to end capture and cancel pending meeting suggestions.

For later provider changes, open the desktop app's Settings. IONOS and custom connection cards offer **Load models**, **Save and test**, and **Remove key**. Answer and speech models are selected independently. IONOS tokens can expire; replace the token when authentication fails.

## What goes to each provider

- Microphone and system audio go to the selected speech provider while Listen is running.
- Recent transcript and meeting background go to the selected answer provider. Automatic suggestions are off by default and operate only inside a user-started Listen session.
- Screen context starts off and must be selected again after restarting. A local frame is refreshed every four seconds and kept in memory. A frame is sent only when generating a suggestion.
- OpenAI answer models can receive that frame directly. For a text-only IONOS/custom model, a saved OpenAI key is used with `gpt-4.1` to describe the frame, then the text description goes to the answer model. Enable **This model accepts images** only when your configured endpoint supports image input.
- The existing **Ask** feature captures the desktop on demand. Text-only IONOS/custom models also use the OpenAI screen-description step there.
- Credentials are encrypted with the OS credential facility before local storage. Transcripts and session history retain Glass's local storage behavior. Automatic upstream app updates are disabled so they cannot replace this fork.

The app uses the documented [IONOS OpenAI-compatible API](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/tool-integration) for Chat Completions, and the [OpenAI GA Realtime transcription protocol](https://developers.openai.com/api/reference/resources/realtime/client-events) with `gpt-4o-mini-transcribe` for listening. It does not assume IONOS provides Realtime transcription. This fork's setup uses personal API keys; the upstream Glass-hosted speech service is not supported.

## Build from source

Use Node.js 20 and npm. macOS Apple Silicon is the packaging target tested for this change.

```sh
npm ci
npm --prefix pickleglass_web ci
npm test
npm run build:all
npm start
```

For a local macOS app and ZIP:

```sh
npm run build:mac:local
```

Artifacts appear in `dist/`. The build checks the packaged backend with a local HTTP request and verifies the desktop/web assets before creating the ZIP. The local build uses an ad-hoc signature and is not Apple-notarized. It has its own application identity and data directory, **Glass Meeting Assistant**. Development runs can set `GLASS_USER_DATA` to use an isolated data directory.

## Validation

`npm test` runs offline tests against local mock HTTP/WebSocket servers and injected capture/provider adapters. They cover endpoint routing, exact model IDs, separate speech selection, key reuse boundaries, fragmented UTF-8/SSE, authentication failures, Realtime acknowledgements/timeouts, suggestion timing/cancellation, and screen-data routing. Renderer and Next.js production builds are checked separately.

Paid-provider calls and a real Google Meet session require your credentials and OS permissions; mock tests do not verify latency, transcription quality, or live account/model availability.

## License

GPL-3.0, inherited from Glass. See [LICENSE](LICENSE).
