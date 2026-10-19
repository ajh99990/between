"""Text-only adapter; executes selected upstream AST method bodies without rewriting.
No network, model call, state storage, prompt prose, or third-party packages.
"""
from __future__ import annotations
import ast
import base64
from datetime import datetime as RealDatetime
from enum import Enum
import hashlib
import json
from pathlib import Path
import random
import re
import sys
from types import SimpleNamespace as NS
from typing import Any, Dict, List, Mapping, Optional

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
for record in manifest['files'] + manifest.get('derivedFiles', []):
    raw = (ROOT / record['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest() != record['sha256']:
        raise ValueError('Upstream source checksum mismatch: ' + record['path'])
defaults = json.loads((ROOT / 'defaults.json').read_text())
class RoleType(str, Enum):
    System = 'system'
    User = 'user'
    Assistant = 'assistant'
class ContextItemBuilder:
    def __init__(self): self.item = {}
    def set_role(self, role): self.item['role'] = role.value if hasattr(role, 'value') else role; return self
    def add_text_content(self, value): self.item['content'] = value; return self
    def build(self): return self.item
class ContentContextMessage: pass
class SessionBackedMessage(ContentContextMessage):
    def __init__(self, content, source_kind, raw):
        self.processed_plain_text = content
        self.source_kind = source_kind
        self.original_message = raw
        self.message_id = raw.message_id
class ModelOutputContextMessage: pass
class ToolResultMediaMessage: pass
class MemorySummaryMessage: pass
class ReferenceMessage: pass
class ToolResultMessage: pass
class TextComponent:
    def __init__(self, text): self.text = text
class AtComponent: pass
class ReplyComponent: pass
class ImageComponent: pass
class EmojiComponent: pass
class VoiceComponent: pass
class ChatConfigUtils:
    @staticmethod
    def get_chat_prompt_for_chat(chat_id, is_group_chat): return ''
logger = NS(warning=lambda *a,**k:None, info=lambda *a,**k:None)
DUPLICATE_TARGET_REPLY_REMINDER_ARG = '_duplicate_target_reply_reminder'
global_config = NS(
    bot=NS(**defaults['BotConfig']), personality=NS(**defaults['PersonalityConfig']),
    chat=NS(reply_style=NS(**defaults['ChatReplyStyleConfig'])),
    experimental=NS(**defaults['ExperimentalConfig']),
    keyword_reaction=NS(**defaults['KeywordReactionConfig']),
)
def get_locale(): return 'zh-CN'
def get_chat_type_and_target_info(session_id): return False, 'private-user'
def build_attention_drift_prompt_block():
    assert defaults['AttentionDriftConfig']['enabled'] is False
    return ''
def is_bot_self(platform, user_id): return user_id == 'bot'
def extract_quote_ids_from_message_sequence(sequence): return []
def build_context_items_from_history_entry(message, **kwargs):
    return ({'role': 'user', 'content': message.processed_plain_text},)

def original_tree(rel):
    return ast.parse((ROOT / 'original' / rel).read_text(), filename=rel)
def exec_original_nodes(rel, names):
    tree=original_tree(rel)
    selected=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.Assign,ast.AnnAssign)) and ((isinstance(n,ast.FunctionDef) and n.name in names) or (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets)))]
    exec(compile(ast.fix_missing_locations(ast.Module(body=selected,type_ignores=[])),rel,'exec',flags=__import__('__future__').annotations.compiler_flag),globals())
exec_original_nodes('src/maisaka/context/message_id_alias.py', {'to_display_message_id','MAX_PLAIN_MESSAGE_ID_LENGTH','ALIAS_PREFIX','ALIAS_HASH_LENGTH'})
exec_original_nodes('src/maisaka/context/message_adapter.py', {'format_speaker_content','parse_speaker_content','SPEAKER_PREFIX_PATTERN'})
methods={
    '_build_personality_prompt','_select_reply_style','_select_temporary_reply_style',
    '_normalize_content','_extract_visible_assistant_reply','_extract_guided_bot_reply',
    '_build_target_message_block','_render_target_at_component','_build_target_message_content',
    '_normalize_attachment_items','_join_chinese_items','_build_reply_attachment_prompt',
    '_get_chat_prompt_for_chat','_build_group_chat_attention_block','_get_prompt_locale',
    '_build_replyer_output_instruction','_build_text_from_message_sequence',
    '_extract_keyword_reaction_match_text','_build_keyword_reaction_prompt','_build_system_prompt',
    '_build_reply_instruction','_build_reply_reference_message','_build_final_user_message',
    '_build_temporary_reply_style_message','_build_requested_reply_style_message',
    '_build_history_messages','_build_request_messages','_resolve_session_id',
    '_is_replyer_filtered_history_message'
}
rel='src/chat/replyer/maisaka_generator_base.py'
cls=next(n for n in original_tree(rel).body if isinstance(n,ast.ClassDef) and n.name=='BaseMaisakaReplyGenerator')
cls.bases=[]
cls.body=[n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name in methods]
exec(compile(ast.fix_missing_locations(ast.Module(body=[cls],type_ignores=[])),rel,'exec',flags=__import__('__future__').annotations.compiler_flag),globals())

def create_messages(payload):
    if not isinstance(payload.get('input'),str) or not payload['input'].strip(): raise ValueError('input is required')
    if payload.get('replyStyle','正常回复') not in ('正常回复','简短表达','长回复'): raise ValueError('unsupported replyStyle')
    reference=payload.get('replyReference','')
    if not isinstance(reference,str): raise ValueError('replyReference must be string')
    now=RealDatetime.fromisoformat(payload['now']) if payload.get('now') else RealDatetime.now()
    class FrozenDatetime:
        @staticmethod
        def now(): return now
    global datetime
    datetime=FrozenDatetime
    generator=BaseMaisakaReplyGenerator.__new__(BaseMaisakaReplyGenerator)
    generator.chat_stream=NS(session_id='text-only-private-session')
    def load_prompt(name, **kwargs):
        return (ROOT/'original'/'prompts'/'zh-CN'/(name+'.prompt')).read_text().format(**kwargs)
    generator._load_prompt=load_prompt
    history=[]
    all_turns=[*payload.get('history',[]),{'role':'user','content':payload['input']}]
    for index,turn in enumerate(all_turns):
        if turn.get('role') not in ('user','assistant') or not isinstance(turn.get('content'),str): raise ValueError('history must contain only user/assistant text')
        role=turn['role'];speaker='麦麦' if role=='assistant' else payload.get('userName','用户')
        info=NS(user_cardname='',user_nickname=speaker,user_id='bot' if role=='assistant' else 'user')
        raw=NS(message_id=str(index+1),message_info=NS(user_info=info),raw_message=NS(components=[TextComponent(turn['content'])]),processed_plain_text=turn['content'],platform='local')
        # Upstream history formatter; guided replies are converted back to assistant by original _build_history_messages.
        visible=format_speaker_content(speaker,turn['content'],now,raw.message_id)
        history.append(SessionBackedMessage(visible,'guided_reply' if role=='assistant' else 'user',raw))
    messages=generator._build_request_messages(chat_history=history,reply_message=history[-1].original_message,reply_reason='',reply_tool_args={'reply_reference':reference,'reply_style':payload.get('replyStyle','正常回复')},stream_id='text-only-private-session')
    return {'messages':messages,'provenance':{'repository':manifest['repository'],'commit':manifest['commit'],'scope':'default text-only private Replyer subpath; not full MaiBot product','upstreamMethodsExecutedWithoutBodyChanges':sorted(methods),'defaultPersonaPreserved':True,'retro':False,'plannerExecuted':False,'expressionSelectorExecuted':False,'postProcessingExecuted':False,'replyReference':reference,'replyReferenceOrigin':payload.get('replyReferenceOrigin','empty public Replyer API default'),'now':now.isoformat(),'historyAdapter':'text-only; original speaker/id formatter; assistant stored as guided_reply; timestamps assigned from now unless caller forks adapter'},'glue':{'inputRecords':'plain text user/assistant -> upstream text-only context objects','forcedInvocation':'every provided user turn explicitly invokes Replyer; Planner/wait decisions not evaluated','promptProseAdded':False}}
if __name__=='__main__':
    print(json.dumps(create_messages(json.load(sys.stdin)),ensure_ascii=False))
