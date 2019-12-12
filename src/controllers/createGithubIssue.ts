import {
  Middleware,
  SlackActionMiddlewareArgs,
  MessageAction,
  SlackViewMiddlewareArgs,
  ViewSubmitAction,
  SlackOptionsMiddlewareArgs,
} from '@slack/bolt';
import { app } from '../index';
import { octokit } from '../apis';
import { WebAPICallResult, View, Option } from '@slack/web-api';

export const CALLBACK_ID = {
  CREATE_GITHUB_ISSUE_ACTION: 'create_github_issue', // slack consoleで設定
  CREATE_GITHUB_ISSUE_VIEW: 'create_github_issue_modal',
};

const BLOCK_ID = {
  REPO_NAME: 'repo_name',
  ISSUE_TITLE: 'issue_title',
  ISSUE_BODY: 'issue_body',
};

export const ACTION_ID = {
  REPO_NAME: 'repo_name',
  ISSUE_TITLE: 'issue_title',
  ISSUE_BODY: 'issue_body',
};

type CreateGithubIssuePrivateMetadata = {
  channel: MessageAction['channel'];
  thread_ts: string;
  messagePermalink: string;
};

const generateCreateGithubIssueEmptyView = (): View => ({
  type: 'modal',
  callback_id: CALLBACK_ID.CREATE_GITHUB_ISSUE_VIEW,
  title: { type: 'plain_text', text: '新しいIssueを作成する' },
  blocks: [],
  submit: {
    type: 'plain_text',
    text: 'submit',
  },
});

const generateCreateGithubIssueFilledView = ({
  privateMetadata,
  defaultRepo,
  issueTitle,
}: {
  privateMetadata: CreateGithubIssuePrivateMetadata;
  defaultRepo: string;
  issueTitle: string;
}): View => ({
  ...generateCreateGithubIssueEmptyView(),
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
        type: 'external_select',
        min_query_length: 3,
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
        initial_value: issueTitle,
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
});

export const onCreateGithubIssueAction: Middleware<SlackActionMiddlewareArgs<
  MessageAction
>> = async ({ ack, payload, context }) => {
  ack();

  try {
    let launched: WebAPICallResult;
    let messagePermalink: string;
    Promise.all([
      // 空のviewを返して First Meaningful Paintを早める
      app.client.views
        .open({
          token: context.botToken,
          trigger_id: payload.trigger_id,
          view: generateCreateGithubIssueEmptyView(),
        })
        .then(result => {
          launched = result;
        }),
      // 元メッセージのpermalinkを取りに行く
      app.client.chat
        .getPermalink({
          channel: payload.channel.id,
          message_ts: payload.message_ts,
          token: process.env.SLACK_BOT_TOKEN,
        })
        .then(result => {
          messagePermalink = result.permalink as string;
        }),
    ]).then(() => {
      const defaultRepo = process.env.GITHUB_DEFAULT_REPO || '';
      const privateMetadata: CreateGithubIssuePrivateMetadata = {
        channel: payload.channel,
        thread_ts: (payload.message.thread_ts || payload.message.ts) as string,
        messagePermalink,
      };

      app.client.views.update({
        token: context.botToken,
        view_id: (launched as any).view.root_view_id,
        view: generateCreateGithubIssueFilledView({
          privateMetadata,
          defaultRepo,
          issueTitle: payload.message.text || '',
        }),
      });
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

export const onRequestRepositoryList: Middleware<SlackOptionsMiddlewareArgs<
  'block_suggestion'
>> = async ({ options, ack }) => {
  const repos: string[] = (
    await octokit.repos.listForOrg({ org: process.env.GITHUB_ORG! })
  ).data.map(repo => repo.name);
  const filteredRepos = repos.filter(repo => {
    return !options.value || repo.startsWith(options.value);
  });
  const resultOptions: Option[] = filteredRepos.map(
    (repo): Option => ({
      text: {
        type: 'plain_text',
        text: repo,
      },
      value: repo,
    })
  );
  ack({
    options: resultOptions,
  });
};
