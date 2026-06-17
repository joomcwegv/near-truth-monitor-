"""
AI Oracle Bot for NEAR Yield-Resume Contract
=============================================
This bot polls the blockchain for pending AI requests,
sends them to OpenRouter (GPT/Claude/Llama), and writes
the response back to the smart contract.

Usage:
  1. Copy .env.example to .env and fill in your keys
  2. pip install requests python-dotenv
  3. python oracle_bot.py
"""

import os
import json
import time
import base64
import subprocess
import requests
from dotenv import load_dotenv

load_dotenv()

# ===== Configuration =====
CONTRACT_ID = os.getenv("CONTRACT_ID", "ai-oracle-123.testnet")
ORACLE_ACCOUNT = os.getenv("ORACLE_ACCOUNT", "ai-oracle-123.testnet")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-4-maverick")
NEAR_RPC = os.getenv("NEAR_RPC", "https://rpc.testnet.near.org")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))  # seconds

# ===== Colors for terminal =====
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
RESET = "\033[0m"

def log(color, emoji, msg):
    print(f"{color}{emoji} {msg}{RESET}")


def get_pending_requests():
    """Fetch pending requests from blockchain via RPC"""
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "query",
            "params": {
                "request_type": "call_function",
                "finality": "final",
                "account_id": CONTRACT_ID,
                "method_name": "get_pending_requests",
                "args_base64": base64.b64encode(b"{}").decode()
            }
        }
        resp = requests.post(NEAR_RPC, json=payload, timeout=10)
        data = resp.json()

        if "result" in data and "result" in data["result"]:
            raw = bytes(data["result"]["result"])
            text = raw.decode("utf-8")
            return json.loads(text)
        return {}
    except Exception as e:
        log(RED, "❌", f"RPC error: {e}")
        return {}


def ask_openrouter(prompt):
    """Send prompt to OpenRouter and get AI response"""
    try:
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://near-truth-monitor.vercel.app",
            "X-Title": "NEAR AI Oracle"
        }
        body = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful AI assistant running on the NEAR blockchain. Keep answers concise (max 200 words). Answer in the same language the user writes in."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 300
        }
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=body,
            timeout=30
        )
        result = resp.json()

        if "choices" in result and len(result["choices"]) > 0:
            return result["choices"][0]["message"]["content"]
        else:
            log(RED, "⚠️", f"OpenRouter unexpected response: {result}")
            return "Sorry, I couldn't generate a response right now."
    except Exception as e:
        log(RED, "❌", f"OpenRouter error: {e}")
        return f"AI Error: {str(e)}"


def respond_to_contract(request_id, response_text):
    """Send the AI response back to the smart contract via NEAR CLI"""
    try:
        args = json.dumps({
            "request_id": int(request_id),
            "response": response_text
        })

        # Write args to temp file to avoid shell escaping issues
        args_file = os.path.join(os.path.dirname(__file__), "temp_respond_args.json")
        with open(args_file, "w", encoding="utf-8") as f:
            f.write(args)

        cmd = [
            "near", "contract", "call-function", "as-transaction",
            CONTRACT_ID, "respond",
            "file-args", args_file,
            "prepaid-gas", "30.0 Tgas",
            "attached-deposit", "0 NEAR",
            "sign-as", ORACLE_ACCOUNT,
            "network-config", "testnet",
            "sign-with-legacy-keychain", "send"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        # Clean up temp file
        if os.path.exists(args_file):
            os.remove(args_file)

        if result.returncode == 0:
            log(GREEN, "✅", f"Response sent to contract for request #{request_id}")
            return True
        else:
            log(RED, "❌", f"NEAR CLI error: {result.stderr or result.stdout}")
            return False
    except Exception as e:
        log(RED, "❌", f"Contract call error: {e}")
        return False


def main():
    log(CYAN, "🤖", "=" * 50)
    log(CYAN, "🤖", "  NEAR AI Oracle Bot Started!")
    log(CYAN, "🤖", f"  Contract: {CONTRACT_ID}")
    log(CYAN, "🤖", f"  AI Model: {OPENROUTER_MODEL}")
    log(CYAN, "🤖", f"  Poll interval: {POLL_INTERVAL}s")
    log(CYAN, "🤖", "=" * 50)

    if not OPENROUTER_API_KEY:
        log(RED, "❌", "OPENROUTER_API_KEY is not set! Check your .env file")
        return

    processed = set()

    while True:
        try:
            pending = get_pending_requests()

            if pending:
                for req_id, prompt in pending.items():
                    if req_id in processed:
                        continue

                    log(YELLOW, "📩", f"New request #{req_id}: \"{prompt}\"")

                    # Ask AI
                    log(CYAN, "🧠", "Sending to OpenRouter...")
                    ai_response = ask_openrouter(prompt)
                    log(GREEN, "💬", f"AI Response: \"{ai_response[:100]}...\"")

                    # Send back to blockchain
                    log(YELLOW, "⛓️", "Writing response to blockchain...")
                    success = respond_to_contract(req_id, ai_response)

                    if success:
                        processed.add(req_id)
                        log(GREEN, "🎉", f"Request #{req_id} completed!")
                    else:
                        log(RED, "⚠️", f"Will retry request #{req_id} next cycle")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            log(YELLOW, "👋", "Bot stopped by user. Goodbye!")
            break
        except Exception as e:
            log(RED, "❌", f"Unexpected error: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
