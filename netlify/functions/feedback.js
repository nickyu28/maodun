// 玩家点游戏里的"反馈"/"游玩记录"按钮时打到这——不用玩家登录任何账号，
// 后端用只有开发者自己存的 GITHUB_TOKEN（Netlify 环境变量，从没发给任何客户端）
// 把内容开成 nickyu28/maodun 上的 GitHub issue，这样夜里巡检的云端任务不用改，
// 照样从 GitHub issue 里读反馈。GITHUB_TOKEN 没配好的话直接 500，前端会退回
// 旧的"打开 GitHub 预填页面"方案，不会把反馈丢掉。

const REPO = 'nickyu28/maodun';
const ALLOWED_LABELS = ['feedback', 'playlog'];

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
    }
    let token = process.env.GITHUB_TOKEN;
    if (!token) {
        return { statusCode: 500, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };
    }
    let data;
    try { data = JSON.parse(event.body || '{}'); } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: 'bad json' }) };
    }
    let title = String(data.title || '').trim().slice(0, 200);
    let body = String(data.body || '').trim().slice(0, 6000);
    let label = ALLOWED_LABELS.indexOf(data.label) !== -1 ? data.label : 'feedback';
    if (!title || !body) {
        return { statusCode: 400, body: JSON.stringify({ error: 'empty title/body' }) };
    }
    try {
        let res = await fetch('https://api.github.com/repos/' + REPO + '/issues', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'maodun-feedback-function',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: title, body: body, labels: [label] })
        });
        if (!res.ok) {
            let detail = await res.text();
            return { statusCode: 502, body: JSON.stringify({ error: 'github rejected it', detail: detail.slice(0, 300) }) };
        }
        let issue = await res.json();
        return { statusCode: 200, body: JSON.stringify({ ok: true, number: issue.number, url: issue.html_url }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'fetch to github failed' }) };
    }
};
