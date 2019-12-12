import { App, MessageAction } from '@slack/bolt';
import { octokit } from './apis';
import {
  CALLBACK_ID,
  onCreateGithubIssueAction,
  onSubmitGithubIssueView,
} from './controllers/createGithubIssue';

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

export const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

// モーダル出すやつ
app.action<MessageAction>(
  { callback_id: CALLBACK_ID.CREATE_GITHUB_ISSUE_ACTION },
  onCreateGithubIssueAction
);
// モーダルの値受け取るやつ
app.view(CALLBACK_ID.CREATE_GITHUB_ISSUE_VIEW, onSubmitGithubIssueView);

// health check
// @ts-ignore
app.receiver.app.get('/h', (req, res) => {
  res.sendStatus(200);
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡ process launched.');
})();
