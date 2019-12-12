import {
  Middleware,
  SlackActionMiddlewareArgs,
  MessageAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
} from '@slack/bolt';
import { app } from '../index';
import { octokit } from '../apis';

export const CALLBACK_ID = {
  CREATE_GITHUB_ISSUE_ACTION: 'create_github_issue', // slack consoleで設定
  CREATE_GITHUB_ISSUE_VIEW: 'create_github_issue_modal',
};

const BLOCK_ID = {
  REPO_NAME: 'repo_name',
  ISSUE_TITLE: 'issue_title',
  ISSUE_BODY: 'issue_body',
};

const ACTION_ID = {
  REPO_NAME: 'repo_name',
  ISSUE_TITLE: 'issue_title',
  ISSUE_BODY: 'issue_body',
};

type CreateGithubIssuePrivateMetadata = {
  channel: MessageAction['channel'];
  thread_ts: string;
  messagePermalink: string;
};

export const onCreateGithubIssueAction: Middleware<SlackActionMiddlewareArgs<
  MessageAction
>> = async ({ ack, payload, context }) => {
  ack();

  try {
    const repoNames = (
      await octokit.repos.listForOrg({ org: process.env.GITHUB_ORG! })
    ).data.map(repo => repo.name);

    const defaultRepo = process.env.GITHUB_DEFAULT_REPO || repoNames[0];
    const messagePermalink = (
      await app.client.chat.getPermalink({
        channel: payload.channel.id,
        message_ts: payload.message_ts,
        token: process.env.SLACK_BOT_TOKEN,
      })
    ).permalink as string;

    const privateMetadata: CreateGithubIssuePrivateMetadata = {
      channel: payload.channel,
      thread_ts: (payload.message.thread_ts || payload.message.ts) as string,
      messagePermalink,
    };

    app.client.views.open({
      token: context.botToken,
      trigger_id: payload.trigger_id,
      view: {
        type: 'modal',
        callback_id: CALLBACK_ID.CREATE_GITHUB_ISSUE_VIEW,
        title: { type: 'plain_text', text: '新しいIssueを作成する' },
        private_metadata: JSON.stringify(privateMetadata),
        blocks: [
          // リポジトリのselect box
          {
            type: 'input',
            block_id: BLOCK_ID.REPO_NAME,
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
              action_id: ACTION_ID.REPO_NAME,
            },
          },
          // タイトルのinput
          {
            type: 'input',
            block_id: BLOCK_ID.ISSUE_TITLE,
            label: {
              type: 'plain_text',
              text: 'タイトル',
            },
            element: {
              type: 'plain_text_input',
              action_id: ACTION_ID.ISSUE_TITLE,
              multiline: false,
              initial_value: payload.message.text,
            },
          },
          // 本文のinput
          {
            type: 'input',
            block_id: BLOCK_ID.ISSUE_BODY,
            label: {
              type: 'plain_text',
              text: '本文',
            },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: ACTION_ID.ISSUE_BODY,
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
  } catch (error) {
    console.log(error);
    return;
  }
};

export const onSubmitGithubIssueView: Middleware<SlackViewMiddlewareArgs<
  ViewSubmitAction
>> = async ({ ack, view, context }) => {
  ack();
  try {
    const { channel, thread_ts, messagePermalink } = JSON.parse(
      view.private_metadata
    ) as CreateGithubIssuePrivateMetadata;

    const issue = await octokit.issues.create({
      owner: process.env.GITHUB_ORG!,
      repo: (view.state as any).values[BLOCK_ID.REPO_NAME][ACTION_ID.REPO_NAME]
        .selected_option.value,
      title: (view.state as any).values[BLOCK_ID.ISSUE_TITLE][
        ACTION_ID.ISSUE_TITLE
      ].value,
      body: `${(view.state as any).values[BLOCK_ID.ISSUE_BODY][
        ACTION_ID.ISSUE_BODY
      ].value || ''}

----
This issue was created based on [this message](${messagePermalink})`,
    });

    app.client.chat.postMessage({
      token: context.botToken,
      channel: channel.id,
      text: `issueを作成しました ${issue.data.html_url}`,
      thread_ts,
    });
  } catch (error) {
    console.log(error);
  }
};
