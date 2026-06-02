@echo off
cd /d C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine
del /f /q atomic.cmd push_out.txt 2>nul
git rm --cached atomic.cmd push_out.txt 2>nul
git add -A
git status --short > last_status.txt 2>&1
for /f "delims=" %%i in ('git status --short') do (
  git commit -m "chore: final repo cleanup" >> last_status.txt 2>&1
  git push origin master >> last_status.txt 2>&1
  goto done
)
:done
git log --oneline -4 >> last_status.txt 2>&1
