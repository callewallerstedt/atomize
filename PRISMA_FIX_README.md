# Prisma File Locking Fix

## Problem
The development server failed to start with this error:
```
EPERM: operation not permitted, rename 'C:\Users\...\query_engine-windows.dll.node.tmpXXXXX' -> 'C:\Users\...\query_engine-windows.dll.node'
```

## Root Cause
- Prisma client files were locked by running Node.js processes
- Multiple instances of the dev server were likely running
- File locking is more aggressive on Windows/OneDrive environments

## Solution
1. **Kill all Node processes:**
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   Get-Process npm -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

2. **Start fresh dev server:**
   ```powershell
   cd 'C:\Users\Ingvar\OneDrive - Chalmers\PLUGGAPP\Atomic Study thang\atomic-studying'
   npm run dev
   ```

## Prevention
- Always stop the dev server before restarting
- Use `Ctrl+C` in the terminal to properly shut down the server
- Avoid having multiple terminals running the same project simultaneously
