import sqlite3, time, json
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "aiui.db"
conn = sqlite3.connect(str(DB))
now = time.time()
yesterday = now - 86400
weekago = now - 86400 * 5

chats = [
    ('chat001', 'default', 'Roman Concrete Durability', now, now),
    ('chat002', 'default', 'How does React hooks work?', yesterday, yesterday),
    ('chat003', 'default', 'Debug my Python script', weekago, weekago),
]
for c in chats:
    conn.execute('INSERT OR IGNORE INTO chats (id, account_id, title, created_at, updated_at) VALUES (?,?,?,?,?)', c)

msgs = []

# Chat 1: Roman Concrete
t0 = now - 3600
msgs.append(('chat001', 'user', 'Why did Roman concrete last so long while modern concrete cracks within decades?', t0))
msgs.append(('chat001', 'assistant', '''Great question! The durability of **Roman concrete** comes down to a few key differences:

## 1. Volcanic Ash (Pozzolana)
Romans used volcanic ash from Pozzuoli near Naples. When mixed with lime, it forms calcium-aluminum-silicate-hydrate (C-A-S-H) — a much more stable crystal structure than modern Portland cement.

## 2. Self-Healing Properties
Recent research found that Roman concrete contains **lime clasts** (unreacted lime chunks). When water enters cracks, it reacts with the lime and literally fills in the cracks automatically.

## 3. Seawater Makes It Stronger
Unlike modern concrete that degrades in saltwater, Roman concrete gets stronger when exposed to seawater.

## Key Takeaway
Modern concrete prioritizes speed of curing and initial strength. Romans optimized for long-term durability.''', t0 + 10))

t1 = now - 3580
msgs.append(('chat001', 'user', 'Can we make concrete like that today?', t1))
msgs.append(('chat001', 'assistant', '''Yes! Several groups are working on it:

- MIT researchers (2023) recreated the exact Roman recipe using hot mixing with quicklime
- An Italian company already sells "Roman-inspired" concrete for marine construction
- The challenge is cost and curing time — Roman concrete took months to fully cure

The biggest opportunity is infrastructure projects where longevity matters more than speed.''', t1 + 10))

# Chat 2: React Hooks
t2 = yesterday - 7200
msgs.append(('chat002', 'user', 'Explain useState and useEffect simply', t2))
msgs.append(('chat002', 'assistant', '''## useState — Component Memory

```jsx
const [count, setCount] = useState(0)
```

Gives your component memory between renders. Returns `[currentValue, setterFunction]`.

## useEffect — Side Effects

```jsx
useEffect(() => {
  document.title = `Count: ${count}`
}, [count])
```

Runs after each render when dependencies change. Perfect for API calls, subscriptions, DOM manipulation.

## Mental Model
- **useState** = "Remember this"
- **useEffect** = "Do this when things change"''', t2 + 10))

# Chat 3: Python Debug
t3 = weekago - 10800
msgs.append(('chat003', 'user', 'My script throws KeyError user_id but the key is definitely there:\n\n```python\ndata = response.json()\nprint(data.keys())\nname = data[\'user_id\'][\'name\']  # KeyError!\n```', t3))
msgs.append(('chat003', 'assistant', '''The issue is likely that `data[\'user_id\']` is a **string**, not a dict!

When you see:
```
data['user_id']        # string like "abc123"
data['user_id']['name'] # KeyError!
```

## Fix
Check the actual structure:
```python
import json
print(json.dumps(data, indent=2))
```

If `user_id` is just an ID string, you probably need a separate endpoint to fetch user details.''', t3 + 10))

for m in msgs:
    role, content = m[1], m[2]
    if isinstance(content, str):
        content = json.dumps(content)
    conn.execute('INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)',
                  (m[0], role, content, m[3]))

conn.commit()
conn.close()
print(f'Done! Seeded {len(chats)} chats, {len(msgs)} messages.')
