import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# 1️⃣ Get API key from .env file
API_KEY = os.getenv("GOOGLE_AI_API_KEY")

# 2️⃣ Configure Gemini client
genai.configure(api_key=API_KEY)

# 3️⃣ Pick a model (Gemini 2.5 recommended)
model = genai.GenerativeModel("gemini-2.5-flash")

# 4️⃣ Give a simple prompt
prompt = "Write a short poem about sunshine and rain."

try:
    response = model.generate_content(prompt)
    print("\n✅ Gemini API Test Successful!")
    print("🔹 Prompt:", prompt)
    print("\n🔸 Model Response:\n", response.text)
except Exception as e:
    print("\n❌ Gemini API Test Failed!")
    print("Error:", e)
