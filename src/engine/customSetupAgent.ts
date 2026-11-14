/**
 * Pure in-house diagnostic engine & domino-effect failure predictor for CapLab 13
 * custom-setup-agent (zero third-party libraries).
 */

export type RepairActionId =
  | 'REPAIR_CPP_SOURCE_AND_RETRY'
  | 'USE_RESPONSE_FILE_AND_STRING_ARRAYS'
  | 'FORCE_BASELINE_X86_64'
  | 'INJECT_8MB_STACK_RESERVE'
  | 'STATIC_OR_STAGE_RUNTIME_DLLS'
  | 'RECOVER_DIRECTORY_LAYOUT'
  | 'CLEAN_OBJ_AND_VERIFY_TOOLCHAIN'
  | 'CLEAN_REPROVISION_AND_RETRY';

export interface DiagnosticFinding {
  code: string;
  severity: 'critical' | 'high' | 'medium';
  repairAction: RepairActionId;
  rootCause: string;
  dominoRisks: string[];
  automatedFix: string;
}

export interface SetupAgentPlan {
  detectedExitCode: number | null;
  hexExitCode: string | null;
  findings: DiagnosticFinding[];
  autoRetryCommand: string;
  estimatedRecoverySeconds: number;
}

export function extractExitCode(logText: string): number | null {
  const hexMatch = logText.match(/0x[0-9a-fA-F]{8}/);
  if (hexMatch) {
    return parseInt(hexMatch[0], 16) >> 0;
  }
  const codeMatch = logText.match(/(?:ExitCode|kode|code)\s*[=:]?\s*(-?\d+)/i);
  if (codeMatch) {
    const parsed = Number.parseInt(codeMatch[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatHexNtStatus(code: number | null): string | null {
  if (code === null || !Number.isFinite(code)) return null;
  const unsigned = code >>> 0;
  return `0x${unsigned.toString(16).toUpperCase().padStart(8, '0')}`;
}

export function analyzeBuildFailureLog(
  rawLog: string,
  explicitExitCode?: number
): SetupAgentPlan {
  const log = rawLog || '';
  const exitCode = explicitExitCode !== undefined ? explicitExitCode : extractExitCode(log);
  const hexCode = formatHexNtStatus(exitCode);
  const findings: DiagnosticFinding[] = [];

  if (
    log.includes('-E or -x required') ||
    /no such file or directory:\s*'s'/i.test(log)
  ) {
    findings.push({
      code: 'PS_ARRAY_SPLAT_CHAR_SPLIT',
      severity: 'critical',
      repairAction: 'USE_RESPONSE_FILE_AND_STRING_ARRAYS',
      rootCause:
        'PowerShell 5.1 unwrapped a 1-element array (@("-static")) into a scalar string, splitting characters during @staticFlags splatting.',
      dominoRisks: [
        'Linking fails identically for both CapLab13Tests.exe and CapLab13Native.exe.',
        'Partial .o artifacts may persist with stale flags on subsequent runs.',
      ],
      automatedFix:
        'Enforce [string[]] typing, write UTF-8 no-BOM @link_tests.rsp / @link_native.rsp response files, and purge build_native\\obj.',
    });
  }

  const cppErrorMatch = log.match(
    /([^\r\n:]+\.(?:cpp|hpp|c|h)):(\d+):(?:\d+:)?\s*error:\s*([^\r\n]+)/i
  );
  if (cppErrorMatch) {
    const didYouMean = log.match(/did you mean\s*'([^']+)'/i);
    findings.push({
      code: 'CPP_SOURCE_COMPILE_ERROR',
      severity: 'critical',
      repairAction: 'REPAIR_CPP_SOURCE_AND_RETRY',
      rootCause: `C++23 compile error at ${cppErrorMatch[1]}:${cppErrorMatch[2]} — ${cppErrorMatch[3].trim()}`,
      dominoRisks: [
        'Unclassified source errors would falsely purge the 182 MB verified .toolchain\\ cache and trigger slow redundant downloads.',
        'Test executable fails to link before Step 2 parity suite runs.',
      ],
      automatedFix: didYouMean
        ? `Preserve smoke-verified .toolchain\\, apply scoped namespace fix ('${didYouMean[1]}') in SetupAgent, and re-compile immediately (~6s).`
        : 'Preserve smoke-verified .toolchain\\ (skip 182 MB re-download), report exact failing line cleanly without PowerShell NativeCommandError noise.',
    });
  }

  if (
    exitCode === -1073741795 ||
    hexCode === '0xC000001D' ||
    /0xC000001D|STATUS_ILLEGAL_INSTRUCTION/i.test(log)
  ) {
    findings.push({
      code: 'CPU_ISA_ILLEGAL_INSTRUCTION',
      severity: 'critical',
      repairAction: 'FORCE_BASELINE_X86_64',
      rootCause:
        'Compiled binary executed AVX2/FMA instructions (-march=x86-64-v3 or /arch:AVX2) unsupported by host CPU.',
      dominoRisks: [
        'CapLab13Tests.exe crashes mid-startup before flushing C++ stdio buffers.',
        'Final CapLab13Native.exe would likewise crash immediately on launch across non-AVX2 Windows 11 systems.',
      ],
      automatedFix:
        'Switch compiler flags to universal baseline -march=x86-64 -mtune=generic (SSE2), invalidate .build_fingerprint, clean objects, and rebuild.',
    });
  }

  if (
    exitCode === -1073741571 ||
    hexCode === '0xC00000FD' ||
    /0xC00000FD|STACK_OVERFLOW/i.test(log)
  ) {
    findings.push({
      code: 'STACK_OVERFLOW_EXHAUSTION',
      severity: 'high',
      repairAction: 'INJECT_8MB_STACK_RESERVE',
      rootCause:
        'Default 1MB Windows PE thread stack exhausted during deep simulation or recursive UI layout.',
      dominoRisks: [
        'Multi-year stress benchmarks and deep JSON parse trees abort unpredictably.',
      ],
      automatedFix:
        'Inject -Wl,--stack,8388608 (or /STACK:8388608) into link response files and re-run test suite.',
    });
  }

  if (
    exitCode === -1073741515 ||
    hexCode === '0xC0000135' ||
    /libstdc\+\+|libc\+\+|libwinpthread|DLL.*not found/i.test(log)
  ) {
    findings.push({
      code: 'MISSING_RUNTIME_DLL',
      severity: 'high',
      repairAction: 'STATIC_OR_STAGE_RUNTIME_DLLS',
      rootCause:
        'MinGW/C++ runtime DLLs missing from working directory or PATH.',
      dominoRisks: [
        'Test executable fails silently with 0xC0000135 before reaching main().',
      ],
      automatedFix:
        'Verify -static linkage in @response file or fall back cleanly with staged runtime DLLs in dist\\ and build_native\\.',
    });
  }

  if (
    /No such file or directory|Cannot open (include|source) file|resource\.rc/i.test(log) &&
    !findings.some(f => f.code === 'PS_ARRAY_SPLAT_CHAR_SPLIT')
  ) {
    findings.push({
      code: 'PATH_OR_FILE_MISPLACED',
      severity: 'high',
      repairAction: 'RECOVER_DIRECTORY_LAYOUT',
      rootCause:
        'ZIP extraction nesting or shifted working directory detached builder from src\\core\\Types.hpp or resources\\resource.rc.',
      dominoRisks: [
        'rc.exe / windres fails before C++ compilation starts.',
        'Include resolution (-I src) cannot locate engine headers.',
      ],
      automatedFix:
        'Scan confined subtree for src\\core\\Types.hpp anchor, relocate $ProjectRoot, unblock downloaded files, and re-run.',
    });
  }

  if (/\[FAIL\]|Parity tests gagal|Summary:.*failed|0xC0000005/i.test(log)) {
    findings.push({
      code: 'PARITY_TEST_OR_MEMORY_FAULT',
      severity: 'critical',
      repairAction: 'CLEAN_OBJ_AND_VERIFY_TOOLCHAIN',
      rootCause:
        'Native parity assertion failed, buffered stdout hid diagnostics prior to crash, or incremental .o/.obj mismatch occurred.',
      dominoRisks: [
        'CapLab13Native.exe deployment blocked by Step 2 parity gate.',
        'Mixing MSVC/GCC/Clang/AVX2 objects creates silent ABI corruption.',
      ],
      automatedFix:
        'Flush unbuffered test output with SEH trap diagnostics, purge stale build_native\\obj cache, run C++23 smoke test on .toolchain\\, and auto-retry build.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: 'TOOLCHAIN_INTEGRITY_AND_CACHE_GUARD',
      severity: 'medium',
      repairAction: 'CLEAN_REPROVISION_AND_RETRY',
      rootCause:
        'No specific fatal token matched; pre-emptive environment hygiene & smoke verification recommended.',
      dominoRisks: [
        'Corrupted partial LLVM-MinGW archives or Windows Mark-of-the-Web blocks can stall PowerShell scripts.',
      ],
      automatedFix:
        'Clear Zone.Identifier MotW streams, run Test-CompilerSmoke binary, purge stale objects, and trigger autonomous retry cycle.',
    });
  }

  return {
    detectedExitCode: exitCode,
    hexExitCode: hexCode,
    findings,
    autoRetryCommand:
      'powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\\custom_setup_agent\\SetupAgent.ps1',
    estimatedRecoverySeconds: findings.some(f => f.repairAction === 'CLEAN_REPROVISION_AND_RETRY')
      ? 24
      : 8,
  };
}
