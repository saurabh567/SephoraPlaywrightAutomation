import sys

with open('utils/runAndroidWithLifecycle.js', 'r') as f:
    lines = f.readlines()

# 1. Remove 'shell: true,' from runCmd default (line 343, 0-indexed 342)
for i, line in enumerate(lines):
    if i >= 340 and i <= 345 and 'shell: true,' in line:
        lines[i] = ''
        print(f'Removed shell: true default at line {i+1}')

# 2. Rewrite getForegroundPackage (lines 486-499)
# Find start and end
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped == 'function getForegroundPackage() {':
        start_idx = i
    elif start_idx is not None and stripped == '}' and i > start_idx:
        # Check that we haven't gone too far - should see try/catch/return null
        snippet = ''.join(lines[start_idx:i+1])
        if 'try' in snippet and 'catch' in snippet and 'return null' in snippet:
            end_idx = i
            break

if start_idx and end_idx:
    print(f'Replacing getForegroundPackage from line {start_idx+1} to {end_idx+1}')
    new_func = '''function getForegroundPackage() {
  try {
    let out = runCmd("adb shell dumpsys window");
    log(`Current Focus Output: ${out}`);
    if (out) {
      const wLines = out.split("\\n");
      for (const wLine of wLines) {
        if (wLine.includes("mCurrentFocus")) {
          const m = wLine.match(/in\\.amazon[^\\s)\\]]+/);
          log(`Regex Match: ${JSON.stringify(m)}`);
          if (m) return m[0];
          break;
        }
      }
    }
    out = runCmd("adb shell dumpsys activity activities");
    if (out) {
      const aLines = out.split("\\n");
      for (const aLine of aLines) {
        if (aLine.includes("mResumedActivity")) {
          const m = aLine.match(/in\\.amazon[^\\s)\\]]+/);
          if (m) return m[0];
          break;
        }
      }
    }
  } catch (_) {}
  return null;
}'''
    lines[start_idx:end_idx+1] = new_func.split('\n')
    for i, l in enumerate(new_func.split('\n')):
        print(f'  New line {start_idx+1+i}: {l}')
else:
    print(f'ERROR: Could not find getForegroundPackage. start={start_idx}, end={end_idx}')

# 3. Add shell: true to commands that need pipes/redirections
# Line 91-93: dumpsys package with 2>/dev/null || true
# Line 161-164: resolve-activity with 2>/dev/null || true
# Line 404: lsof with 2>/dev/null || true
# Line 479: pm list packages | grep
# Line 638: input keyevent || true
# Line 692: lsof with 2>/dev/null || true
# Line 807-808: dumpsys window with pipes
# Line 829-830: pm clear with 2>/dev/null || true

changes = {
    # Lsof calls (no existing opts)
    404: ("    const lines = runCmd(`lsof -ti :${port} 2>/dev/null || true`, { shell: true });"),
    692: ("        const pids = runCmd(`lsof -ti :${APPIUM_PORT} 2>/dev/null || true`, { shell: true }).trim().split('\\n').filter(Boolean);"),
    
    # pm list packages | grep (no existing opts)
    479: ("    const out = runCmd(`adb shell pm list packages | grep ${AMAZON_PACKAGE}`, { shell: true });"),
}

# Lines with existing opts that need shell: true added
line_replacements = {}

# Check each line with existing opts
for i, line in enumerate(lines):
    stripped = line.strip()
    idx = i + 1  # 1-indexed
    
    # Line 91-93: dumpsys package
    if 'adb shell dumpsys package' in stripped and '2>/dev/null || true' in stripped and '{ timeout: 15000 }' in stripped:
        line_replacements[idx] = stripped.replace('{ timeout: 15000 }', '{ timeout: 15000, shell: true }')
        
    # Line 161-164: resolve-activity
    if 'adb shell cmd package resolve-activity' in stripped and '2>/dev/null || true' in stripped and '{ timeout: 10000 }' in stripped:
        line_replacements[idx] = stripped.replace('{ timeout: 10000 }', '{ timeout: 10000, shell: true }')
    
    # Line 638: input keyevent
    if 'adb shell input keyevent' in stripped and '|| true' in stripped and '{ timeout: 5000 }' in stripped:
        line_replacements[idx] = stripped.replace('{ timeout: 5000 }', '{ timeout: 5000, shell: true }')
    
    # Line 829-830: pm clear
    if "adb shell pm clear" in stripped and '2>/dev/null || true' in stripped and '{ timeout: 15000 }' in stripped:
        line_replacements[idx] = stripped.replace('{ timeout: 15000 }', '{ timeout: 15000, shell: true }')

# Line 807-808: runCmdOptional with pipes (add second arg)
for i, line in enumerate(lines):
    stripped = line.strip()
    if 'adb shell dumpsys window' in stripped and 'grep mCurrentFocus' in stripped and 'grep -o' in stripped and '|| true' in stripped:
        # This is inside runCmdOptional, add shell: true as second arg
        indent = line[:len(line) - len(line.lstrip())]
        lines[i] = indent + stripped + ',\n' + indent + '  { shell: true }'
        print(f'Added shell: true to runCmdOptional at line {i+1}')

# Apply exact line replacements
for idx, new_content in changes.items():
    i = idx - 1
    old = lines[i].strip()
    print(f'Line {idx}: {old} -> {new_content.strip()}')
    indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
    lines[i] = indent + new_content.strip() + '\n'

for idx, new_content in line_replacements.items():
    i = idx - 1
    old = lines[i].strip()
    print(f'Line {idx}: {old} -> {new_content}')
    indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
    lines[i] = indent + new_content + '\n'

with open('utils/runAndroidWithLifecycle.js', 'w') as f:
    f.writelines(lines)

print('Done')
