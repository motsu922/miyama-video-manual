# AI Translation Function

The browser never receives the OpenAI API key. Configure the secret and deploy the function from the project root:

```powershell
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions
```

The callable function is deployed to `asia-northeast1` as `translateManual`.

Anonymous Authentication must remain enabled because manual edits and translation requests require a signed-in Firebase user.
