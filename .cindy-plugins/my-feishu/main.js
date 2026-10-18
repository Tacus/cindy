function sendResult(msg, payload) {
  return cindy.send({ type: 'tool-result', callId: msg.callId, ...payload });
}

cindy.onHostMessage(async function (msg) {
  if (msg.type !== 'tool-call' || msg.tool !== 'whoami') return;
  const authAccount = typeof msg.args?.authAccount === 'string' ? msg.args.authAccount : undefined;
  const response = await cindy.fetch({ url: 'https://open.feishu.cn/open-apis/authen/v1/user_info', method: 'GET', authAccount, callId: msg.callId });
  if (!response.ok) { await sendResult(msg, { ok: false, errorCode: 'FEISHU_REQUEST_FAILED', message: response.message || '飞书身份查询失败。' }); return; }
  let body; try { body = JSON.parse(response.body); } catch { body = { raw: response.body }; }
  await sendResult(msg, { ok: true, result: { connectedAccount: authAccount || 'default', user: body?.data || body } });
});
