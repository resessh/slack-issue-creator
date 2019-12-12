import { App, MessageAction } from '@slack/bolt';
import Octokit from '@octokit/rest';

if (!process.env.SLACK_SIGNING_SECRET) {
  console.error('env.SLACK_SIGNING_SECRET must be set.');
  process.exit(1);
}
if (!process.env.SLACK_BOT_TOKEN) {
  console.error('env.SLACK_BOT_TOKEN must be set.');
  process.exit(1);
}
if (!process.env.GITHUB_BOT_TOKEN) {
  console.error('env.GITHUB_BOT_TOKEN must be set.');
  process.exit(1);
}
if (!process.env.GITHUB_ORG) {
  console.error('env.GITHUB_ORG must be set.');
  process.exit(1);
}

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

const octokit = new Octokit({
  auth: process.env.GITHUB_BOT_TOKEN,
});

app.action<MessageAction>(
  { callback_id: 'create_github_issue' },
  async ({ ack, say, payload, context }) => {
    ack();
    console.log(payload);
    console.log(context);

    let repoNames: string[];
    try {
      repoNames = (
        await octokit.repos.listForOrg({ org: process.env.GITHUB_ORG! })
      ).data.map(repo => repo.name);
    } catch (error) {
      say(`error occured. ${JSON.stringify(error)}`);
      return;
    }

    const defaultRepo = process.env.GITHUB_DEFAULT_REPO || repoNames[0];
    const messagePermalink = (
      await app.client.chat.getPermalink({
        channel: payload.channel.id,
        message_ts: payload.message_ts,
        token: process.env.SLACK_BOT_TOKEN,
      })
    ).permalink;

    app.client.views.open({
      token: context.botToken,
      trigger_id: payload.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'create_github_issue_modal',
        title: { type: 'plain_text', text: '新しいIssueを作成する' },
        private_metadata: JSON.stringify({
          channel: payload.channel,
          thread_ts: payload.message.thread_ts || payload.message.ts,
          messagePermalink,
        }),
        blocks: [
          {
            type: 'input',
            block_id: 'repo',
            label: {
              type: 'plain_text',
              text: 'リポジトリ',
            },
            element: {
              type: 'static_select',
              options: repoNames.map(repoName => ({
                text: {
                  type: 'plain_text',
                  text: repoName,
                },
                value: repoName,
              })),
              initial_option: {
                text: { type: 'plain_text', text: defaultRepo },
                value: defaultRepo,
              },
              action_id: 'repo_name',
            },
          },
          {
            type: 'input',
            block_id: 'issue_title',
            label: {
              type: 'plain_text',
              text: 'タイトル',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'issue_title',
              multiline: false,
              initial_value: payload.message.text,
            },
          },
          {
            type: 'input',
            block_id: 'issue_body',
            label: {
              type: 'plain_text',
              text: '本文',
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'issue_body',
              multiline: true,
              initial_value: '',
            },
          },
        ],
        submit: {
          type: 'plain_text',
          text: 'submit',
        },
      },
    });
  }
);

app.view('create_github_issue_modal', async ({ ack, body, view, context }) => {
  ack();
  const { channel, thread_ts, messagePermalink } = JSON.parse(
    view.private_metadata
  );

  const issue = await octokit.issues.create({
    owner: process.env.GITHUB_ORG!,
    repo: (view.state as any).values.repo.repo_name.selected_option.value,
    title: (view.state as any).values.issue_title.issue_title.value,
    body: `${(view.state as any).values.issue_body.issue_body.value || ''}

----
:octocat: This issue was created based on [this message](${messagePermalink})`,
  });

  app.client.chat.postMessage({
    token: context.botToken,
    channel: channel.id,
    text: `issueを作成しました ${issue.data.html_url}`,
    thread_ts,
  });
});

(async () => {
  await app.start(process.env.PORT || 3000);
})();
