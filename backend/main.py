import os
import threading
import telebot

# ... keep your existing imports and FastAPI setup ...

# 👇 CHANGED: Read token from Environment Variable
MAIN_BOT_TOKEN = os.getenv("HOST_BOT_TOKEN") 

def run_main_bot():
    # If token is missing, don't crash, just skip starting the bot
    if not MAIN_BOT_TOKEN:
        print("⚠️ No HOST_BOT_TOKEN found in Env Vars. Main bot will not run.")
        return

    bot = telebot.TeleBot(MAIN_BOT_TOKEN)

    @bot.message_handler(commands=['start'])
    def send_welcome(message):
        # Create the button that opens your Mini App
        markup = telebot.types.InlineKeyboardMarkup()
        
        # 👇 Update this with your actual Frontend URL
        web_app_url = "https://my-python-editor.onrender.com" 
        
        web_app = telebot.types.WebAppInfo(web_app_url)
        markup.add(telebot.types.InlineKeyboardButton("🚀 Open Cloud Editor", web_app=web_app))
        
        bot.reply_to(message, "Welcome to Python Cloud Host! 🐍\nClick below to start coding.", reply_markup=markup)

    try:
        print("✅ Main Host Bot Started...")
        bot.infinity_polling()
    except Exception as e:
        print(f"❌ Main Bot Error: {e}")

# Start the bot in background
threading.Thread(target=run_main_bot, daemon=True).start()
