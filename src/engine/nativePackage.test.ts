import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeBuildFailureLog,
  extractExitCode,
  formatHexNtStatus,
} from './customSetupAgent.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('exe/game.exe is a valid Windows 11 x64 PE32+ executable with requireAdministrator manifest', () => {
  const exePath = path.join(ROOT, 'exe', 'game.exe');
  assert.equal(fs.existsSync(exePath), true, 'exe/game.exe must exist');
  const buf = fs.readFileSync(exePath);

  assert.equal(buf.readUInt16LE(0), 0x5a4d, 'DOS MZ signature');
  const lfanew = buf.readUInt32LE(0x3c);
  assert.equal(buf.subarray(lfanew, lfanew + 4).toString('ascii'), 'PE\0\0', 'PE signature');

  const coffOff = lfanew + 4;
  assert.equal(buf.readUInt16LE(coffOff), 0x8664, 'AMD64 machine');
  const optOff = coffOff + 20;
  assert.equal(buf.readUInt16LE(optOff), 0x020b, 'PE32+ optional magic');
  assert.equal(buf.readUInt16LE(optOff + 68), 2, 'WINDOWS_GUI subsystem');
  assert.equal(buf.readUInt16LE(optOff + 70) & 0x8160, 0x8160, 'ASLR + NX + HighEntropyVA');

  const utf8Text = buf.toString('utf8');
  assert.ok(utf8Text.includes('requireAdministrator'), 'Must embed requireAdministrator UAC manifest');
  assert.ok(utf8Text.includes('ShellExecuteW'), 'Must import ShellExecuteW');
  assert.ok(utf8Text.includes('GetModuleFileNameW'), 'Must import GetModuleFileNameW');
  assert.ok(utf8Text.includes('GetFileAttributesW'), 'Must import GetFileAttributesW');
  assert.ok(utf8Text.includes('MessageBoxW'), 'Must import MessageBoxW');
});

test('Windows 11 ZIP packages exist in /exe, /public/downloads, and /public/exe identically with SetupAgent', () => {
  const exeZip = path.join(ROOT, 'exe', 'CapLab13_Windows11_Native.zip');
  const dlZip = path.join(ROOT, 'public', 'downloads', 'CapLab13_Windows11_Native.zip');
  const pubExeZip = path.join(ROOT, 'public', 'exe', 'CapLab13_Windows11_Native.zip');
  assert.equal(fs.existsSync(exeZip), true, 'exe ZIP must exist');
  assert.equal(fs.existsSync(dlZip), true, 'public/downloads ZIP must exist');
  assert.equal(fs.existsSync(pubExeZip), true, 'public/exe ZIP must exist');

  const a = fs.readFileSync(exeZip);
  const b = fs.readFileSync(dlZip);
  const c = fs.readFileSync(pubExeZip);
  assert.equal(a.equals(b), true, 'exe and public/downloads ZIP copies must match');
  assert.equal(a.equals(c), true, 'exe and public/exe ZIP copies must match');
  assert.equal(a.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), true, 'Valid ZIP header');

  const ascii = a.toString('latin1');
  assert.ok(ascii.includes('CapLab13_Windows11/game.exe'));
  assert.ok(ascii.includes('CapLab13_Windows11/builder/build_pipeline.bat'));
  assert.ok(ascii.includes('CapLab13_Windows11/builder/CustomBuildOrchestrator.ps1'));
  assert.ok(ascii.includes('CapLab13_Windows11/custom_setup_agent/SetupAgent.ps1'));
  assert.ok(ascii.includes('CapLab13_Windows11/custom_compiler/custom_pe64_compiler.py'));

  const agentSrc = fs.readFileSync(
    path.join(ROOT, 'exe', 'custom_setup_agent', 'SetupAgent.ps1'),
    'utf8'
  );
  const agentPub = fs.readFileSync(
    path.join(ROOT, 'public', 'exe', 'custom_setup_agent', 'SetupAgent.ps1'),
    'utf8'
  );
  assert.equal(agentSrc, agentPub, 'public/exe/custom_setup_agent/SetupAgent.ps1 must stay synced');
  assert.equal(
    fs.existsSync(path.join(ROOT, 'public', 'exe', 'index.html')),
    false,
    'public/exe must NOT contain index.html so SPA /exe route resolves cleanly'
  );
});

test('NativeParityTests.cpp enforces $10M starting cash, comp_agro merger target, save::MAP_GRID_SIZE, pretty JSON, and SEH diagnostics', () => {
  const testCpp = fs.readFileSync(path.join(ROOT, 'exe', 'tests', 'NativeParityTests.cpp'), 'utf8');
  assert.ok(testCpp.includes('pIt->second.cash == 10000000'), 'Must assert 10M cash matching SaveSystem');
  assert.equal(testCpp.includes('pIt->second.cash == 5000000'), false, 'Stale 5M assertion must be removed');
  assert.ok(testCpp.includes('"comp_agro"'), 'Must target valid roster company comp_agro');
  assert.equal(testCpp.includes('"comp_kuliner"'), false, 'Invalid comp_kuliner target must be removed');
  assert.ok(testCpp.includes('save::MAP_GRID_SIZE'), 'Must explicitly qualify save::MAP_GRID_SIZE');
  assert.equal(testCpp.includes('state.mapParcels, MAP_GRID_SIZE)'), false, 'Bare unqualified MAP_GRID_SIZE must not appear');
  assert.ok(testCpp.includes('\\"playerCompanyId\\": \\"comp_player\\"'), 'Must match pretty-printed JSON spacing');
  assert.ok(testCpp.includes('std::unitbuf'), 'Must flush stdio immediately via std::unitbuf');
  assert.ok(testCpp.includes('SetUnhandledExceptionFilter'), 'Must install Win32 SEH crash trap');
});

test('CustomBuildOrchestrator.ps1 and SetupAgent.ps1 use baseline x86-64, response files, and smoke-preserving recovery', () => {
  const ps1Path = path.join(ROOT, 'exe', 'builder', 'CustomBuildOrchestrator.ps1');
  const script = fs.readFileSync(ps1Path, 'utf8');
  assert.ok(
    script.includes('[string[]]$staticFlags'),
    'Must explicitly type $staticFlags as [string[]] to prevent PowerShell 5.1 char[] splat bug'
  );
  assert.ok(script.includes('[string[]]$cflags'), 'Must explicitly type $cflags as [string[]]');
  assert.ok(script.includes('[string[]]$AllObjs'), 'Must explicitly type $AllObjs as [string[]]');
  assert.ok(script.includes('[string[]]$EngineObjs'), 'Must explicitly type $EngineObjs as [string[]]');
  assert.ok(script.includes('-march=x86-64'), 'Must target baseline x86-64 SSE2 for universal Windows 11 compat');
  assert.equal(script.includes('-march=x86-64-v3'), false, 'AVX2-only v3 flag must not be hardcoded');
  assert.ok(script.includes('Test-CompilerSmoke'), 'Must smoke-test C++23 compiler before building 15 units');
  assert.ok(script.includes('link_tests.rsp') && script.includes('link_native.rsp'), 'Must link via response files');

  const agentPs1 = fs.readFileSync(path.join(ROOT, 'exe', 'custom_setup_agent', 'SetupAgent.ps1'), 'utf8');
  assert.ok(agentPs1.includes('CPP_SOURCE_COMPILE_ERROR'), 'Agent must classify C++ compile errors without nuking healthy toolchain');
  assert.ok(agentPs1.includes('Repair-CppDiagnosticIfKnown'), 'Agent must support confined Clang namespace auto-repair');
  assert.ok(agentPs1.includes('prevCleanSignature'), 'Agent must halt duplicate clean-rebuild failures deterministically');

  const cmakeText = fs.readFileSync(path.join(ROOT, 'exe', 'CMakeLists.txt'), 'utf8');
  assert.equal(cmakeText.includes('/arch:AVX2'), false, 'CMakeLists must not force /arch:AVX2');
  assert.equal(cmakeText.includes('-march=x86-64-v3'), false, 'CMakeLists must not force -march=x86-64-v3');
});

test('customSetupAgent classifies Windows 11 build failure codes and predicts domino risks', () => {
  const cppPlan = analyzeBuildFailureLog(
    "NativeParityTests.cpp:74:70: error: use of undeclared identifier 'MAP_GRID_SIZE'; did you mean 'caplab::save::MAP_GRID_SIZE'?"
  );
  assert.equal(cppPlan.findings[0].code, 'CPP_SOURCE_COMPILE_ERROR');
  assert.equal(cppPlan.findings[0].repairAction, 'REPAIR_CPP_SOURCE_AND_RETRY');

  const splatPlan = analyzeBuildFailureLog(
    "clang-23: error: -E or -x required when input is from standard input\nclang-23: error: no such file or directory: 's'"
  );
  assert.equal(splatPlan.findings[0].code, 'PS_ARRAY_SPLAT_CHAR_SPLIT');
  assert.equal(splatPlan.findings[0].repairAction, 'USE_RESPONSE_FILE_AND_STRING_ARRAYS');

  const avxPlan = analyzeBuildFailureLog('Parity tests gagal! (ExitCode=-1073741795 / 0xC000001D)');
  assert.equal(avxPlan.hexExitCode, '0xC000001D');
  assert.ok(avxPlan.findings.some(f => f.repairAction === 'FORCE_BASELINE_X86_64'));

  const stackPlan = analyzeBuildFailureLog('Crash code: -1073741571', -1073741571);
  assert.equal(stackPlan.hexExitCode, '0xC00000FD');
  assert.ok(stackPlan.findings.some(f => f.repairAction === 'INJECT_8MB_STACK_RESERVE'));

  const dllPlan = analyzeBuildFailureLog('System error 0xC0000135 libstdc++-6.dll missing');
  assert.equal(dllPlan.hexExitCode, '0xC0000135');
  assert.ok(dllPlan.findings.some(f => f.repairAction === 'STATIC_OR_STAGE_RUNTIME_DLLS'));

  const pathPlan = analyzeBuildFailureLog('llvm-windres.exe: resources\\resource.rc: No such file or directory');
  assert.ok(pathPlan.findings.some(f => f.repairAction === 'RECOVER_DIRECTORY_LAYOUT'));

  const parityPlan = analyzeBuildFailureLog('=== CapLab 13 ===\nParity tests gagal!');
  assert.ok(parityPlan.findings.some(f => f.repairAction === 'CLEAN_OBJ_AND_VERIFY_TOOLCHAIN'));

  assert.equal(extractExitCode('ExitCode=-1073741795'), -1073741795);
  assert.equal(formatHexNtStatus(-1073741795), '0xC000001D');
});

test('Interactive Setup GUI, STA launcher, dGPU priority, CPU worker offloading, and escaped batch output are configured cleanly', () => {
  const batText = fs.readFileSync(path.join(ROOT, 'exe', 'builder', 'build_pipeline.bat'), 'utf8');
  assert.ok(batText.includes('BUILD ^& SHORTCUT SELESAI!'), 'Must escape & as ^& inside cmd echo');
  assert.equal(batText.includes('BUILD & SHORTCUT SELESAI!'), false, 'Unescaped & causes SHORTCUT command error');

  const guiPs1 = fs.readFileSync(path.join(ROOT, 'exe', 'installer', 'InstallerGui.ps1'), 'utf8');
  assert.ok(guiPs1.includes('System.Windows.Forms'), 'InstallerGui.ps1 must use WinForms GUI');
  assert.ok(guiPs1.includes('SetupAgent.ps1'), 'InstallerGui.ps1 must embed custom_setup_agent/SetupAgent.ps1');
  assert.ok(guiPs1.includes('Win32_VideoController'), 'InstallerGui.ps1 must scan GPU hardware preflight');

  const launchBat = fs.readFileSync(path.join(ROOT, 'exe', 'installer', 'LaunchInstaller.bat'), 'utf8');
  assert.ok(launchBat.includes('-STA'), 'LaunchInstaller.bat must launch WinForms GUI in STA apartment');
  assert.ok(launchBat.includes('build_pipeline.bat'), 'LaunchInstaller.bat must retain CLI fallback');

  const d2dCpp = fs.readFileSync(path.join(ROOT, 'exe', 'src', 'graphics', 'D2DRenderer.cpp'), 'utf8');
  assert.ok(d2dCpp.includes('EnumAdapters1') && d2dCpp.includes('DedicatedVideoMemory'), 'D2DRenderer must prioritize highest-VRAM discrete GPU');

  const mainCpp = fs.readFileSync(path.join(ROOT, 'exe', 'src', 'main.cpp'), 'utf8');
  assert.ok(mainCpp.includes('NvOptimusEnablement') && mainCpp.includes('AmdPowerXpressRequestHighPerformance'), 'main.cpp must export hybrid graphics dGPU hints');

  const cmakeText = fs.readFileSync(path.join(ROOT, 'exe', 'CMakeLists.txt'), 'utf8');
  const batWin = fs.readFileSync(path.join(ROOT, 'exe', 'build_windows11.bat'), 'utf8');
  const orchPs1 = fs.readFileSync(path.join(ROOT, 'exe', 'builder', 'CustomBuildOrchestrator.ps1'), 'utf8');
  assert.ok(cmakeText.includes('SimulationWorker.cpp'), 'CMakeLists.txt must include SimulationWorker.cpp');
  assert.ok(batWin.includes('SimulationWorker.cpp'), 'build_windows11.bat must include SimulationWorker.cpp');
  assert.ok(orchPs1.includes('SimulationWorker.cpp'), 'CustomBuildOrchestrator.ps1 must include SimulationWorker.cpp');

  const pubZipAscii = fs.readFileSync(path.join(ROOT, 'exe', 'CapLab13_Windows11_Native.zip')).toString('latin1');
  assert.ok(pubZipAscii.includes('CapLab13_Windows11/installer/InstallerGui.ps1'), 'ZIP must contain InstallerGui.ps1');
  assert.ok(pubZipAscii.includes('CapLab13_Windows11/installer/LaunchInstaller.bat'), 'ZIP must contain LaunchInstaller.bat');
});
