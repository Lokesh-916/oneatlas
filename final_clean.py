import subprocess, os
os.chdir(r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine")

for f in ["cleanup_e.py","cleanup_out.txt","cleanup_err.txt"]:
    r = subprocess.run(["git","rm","--cached",f], capture_output=True, text=True)
    if os.path.exists(f): os.remove(f)
    print(f"removed {f}: {r.returncode}")

r = subprocess.run(["git","add","-A"], capture_output=True, text=True)
r2 = subprocess.run(["git","commit","-m","chore: remove temp build scripts from repo"],
                    capture_output=True, text=True)
print("commit:", r2.stdout.strip())
r3 = subprocess.run(["git","push","origin","master"], capture_output=True, text=True)
print("push:", r3.stdout.strip(), r3.stderr.strip())
r4 = subprocess.run(["git","log","--oneline","-5"], capture_output=True, text=True)
print("Log:\n" + r4.stdout)