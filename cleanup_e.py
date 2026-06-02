import subprocess, os
os.chdir(r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine")

# Remove stray routing.py at src/compiler/ root (the real one is in tools/)
for f in ["src/compiler/routing.py", "squash_e.py", "squash_out.txt",
          "squash_err.txt", "fix_e.py", "fix_out.txt", "fix_err.txt"]:
    if os.path.exists(f):
        os.remove(f)
        print(f"Deleted {f}")

# Also git rm the stray routing.py if tracked
r = subprocess.run(["git","rm","--cached","src/compiler/routing.py"], 
                   capture_output=True, text=True)
if r.returncode == 0:
    print("git rm src/compiler/routing.py:", r.stdout.strip())

r = subprocess.run(["git","add","-A"], capture_output=True, text=True)
r2 = subprocess.run(["git","status","--short"], capture_output=True, text=True)
print("Status:", r2.stdout.strip())

if r2.stdout.strip():
    r3 = subprocess.run(
        ["git","commit","-m","chore: remove stray routing.py from root, keep tools/routing.py"],
        capture_output=True, text=True)
    print("commit:", r3.stdout.strip())
    r4 = subprocess.run(["git","push","origin","master"], capture_output=True, text=True)
    print("push:", r4.stdout.strip(), r4.stderr.strip())
else:
    print("Nothing to commit - clean")

r5 = subprocess.run(["git","log","--oneline","-5"], capture_output=True, text=True)
print("Final log:\n" + r5.stdout)