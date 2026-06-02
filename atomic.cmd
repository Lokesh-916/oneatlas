@echo off
cd /d C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine
del /f /q status.cmd status2.txt final.cmd 2>nul
git rm --cached final.cmd 2>nul
git add -A
git commit -m "chore: clean repo root — remove all temp scripts" > push_out.txt 2>&1
git push origin master >> push_out.txt 2>&1
git log --oneline -5 >> push_out.txt 2>&1
