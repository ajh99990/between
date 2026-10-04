#!/usr/bin/env python3
"""No credentials, model calls, listeners or MCP processes are used."""
import json, pathlib, shutil, subprocess, sys, tempfile
root = pathlib.Path(sys.argv[1]).resolve()
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is required')
contract = json.loads(pathlib.Path(__file__).with_name('source-manifest.json').read_text())
script = '''import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const sdk=await import(pathToFileURL(process.argv[1]).href);
assert.equal(sdk.SDK_VERSION,process.argv[2]);
assert.equal(sdk.MANAGED_HOST_CONTRACT_VERSION,Number(process.argv[3]));
const result=sdk.QueryOptionsSchema.safeParse({sessionToolAllowlist:[],env:{HOME:process.env.HOME,QWEN_HOME:process.env.QWEN_HOME,QWEN_RUNTIME_DIR:process.env.QWEN_RUNTIME_DIR},chatRecording:false,captureProviderContent:false,skipStartupContext:true,hooks:[{event:'PreToolUse',callback:()=>false}]});
assert.equal(result.success,true);
assert.equal(sdk.QueryOptionsSchema.safeParse({sessionToolAllowlist:[],env:{}}).success,false);
console.log('SDK identity and explicit managed options passed');'''
with tempfile.TemporaryDirectory(prefix='managed-host-smoke-', dir=root.parent) as temp:
    env = {'HOME':temp, 'QWEN_HOME':temp, 'QWEN_RUNTIME_DIR':temp, 'PATH':'/usr/bin:/bin', 'OTEL_SDK_DISABLED':'true', 'NODE_OPTIONS':'--require=\"' + str(pathlib.Path(__file__).with_name('network-deny.cjs').resolve()) + '\"', 'QWEN_TEST_NETWORK_LOG':str(pathlib.Path(temp) / 'network.jsonl')}
    subprocess.run([node,'--no-global-search-paths','--input-type=module','-e',script,str(root/'packages/sdk-typescript/dist/index.mjs'),contract['sdk_version'],str(contract['managed_host_contract_version'])],cwd=temp,env=env,check=True)
    config_check = """import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {Config}=await import(pathToFileURL(process.argv[1]).href);
const c=new Config({sessionId:'compiled-policy-smoke',sessionToolAllowlist:[],targetDir:process.cwd(),cwd:process.cwd(),debugMode:false,bareMode:true,disableAllHooks:false,telemetry:{enabled:true},usageStatisticsEnabled:true});
assert.equal(c.getBareMode(),true);assert.equal(c.getDisableAllHooks(),false);assert.equal(c.getSkipStartupContext(),true);assert.equal(c.getTelemetryEnabled(),false);assert.equal(c.getUsageStatisticsEnabled(),false);
await c.shutdown();console.log('Compiled Config: managed hooks enabled, startup skipped, upstream telemetry disabled');"""
    subprocess.run([node,'--input-type=module','-e',config_check,str(root/'packages/core/dist/src/config/config.js')],cwd=temp,env=env,check=True)
    result = subprocess.run([node,str(root/'dist/cli.js'),'--version'],cwd=temp,env=env,check=True,capture_output=True,text=True)
    assert result.stdout.strip() == '0.24.7', result.stdout
    help_result = subprocess.run([node,str(root/'dist/cli.js'),'--help'],cwd=temp,env=env,check=True,capture_output=True,text=True)
    for flag in ['--session-tool-allowlist','--capture-provider-content','--provider-capture-max-bytes', '--skip-startup-context']:
        assert flag in help_result.stdout, flag
    events = [json.loads(line) for line in pathlib.Path(env['QWEN_TEST_NETWORK_LOG']).read_text().splitlines()]
    assert events and not any(event['event'] == 'blocked' for event in events), events
print('Built SDK, Config and CLI smoke passed; no query or network attempt')
