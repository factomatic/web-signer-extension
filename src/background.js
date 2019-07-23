/// <reference types="chrome" />

const NEW_TAB_OPEN = 'newTabOpen';
const IMPORT_KEYS_REQUEST = 'importKeysRequest';
const RESTORE_VAULT_REQUEST = 'restoreVaultRequest';
const CHECK_REQUESTS = 'checkRequests';
const PENDING_REQUESTS_COUNT = 'pendingRequestsCount';
const GET_CONTENT_TO_SIGN = 'getContentToSign';
const CANCEL_SIGNING = 'cancelSigning';
const SKIP_SIGNING = 'skipSigning';
const SEND_SIGNED_DATA_BACK = 'sendSignedDataBack';
const RECEIVE_CONTENT_TO_SIGN = 'receiveContentToSign';

(function() {
  let contentsToSign = [];
  let responseCallbacks = [];
  let currentRequestedContentIndex = -1;
  let importKeysRequested = false;
  let restoreVaultRequested = false;

  chrome.browserAction.setBadgeText({text: "0"});

  chrome.runtime.onMessage.addListener((msg, sender, response) => {
    switch (msg.type) {
      case IMPORT_KEYS_REQUEST:
        importKeysRequested = true;
        response({success: true});
        break;
      case RESTORE_VAULT_REQUEST:
        restoreVaultRequested = true;
        response({success: true});
        break;
      case CHECK_REQUESTS:
        response({
          importKeysRequested: importKeysRequested,
          restoreVaultRequested: restoreVaultRequested
        });
        break;
      case NEW_TAB_OPEN:
        importKeysRequested = false;
        restoreVaultRequested = false;
        break;
      case RECEIVE_CONTENT_TO_SIGN:
        if (msg.content) {
          contentsToSign.push({
            content: msg.content,
            from: sender.url
          });
          responseCallbacks.push(response);

          chrome.browserAction.getBadgeText({}, function(result) {
            const number = parseInt(result) + 1;
            chrome.browserAction.setBadgeText({text: number.toString()});
          });

          chrome.notifications.create({
            type: "basic",
            title: "Notification message",
            message: "New signing request received",
            iconUrl: "assets/web-signer-logo.png"
          });

          return true;
        } else {
          response({
            success: false
          });
        }
        break;
      case PENDING_REQUESTS_COUNT:
        response({
          pendingRequestsCount: contentsToSign.length,
        });
        break;
      case GET_CONTENT_TO_SIGN:
        if (contentsToSign.length > 0) {
          if(currentRequestedContentIndex > -1 && currentRequestedContentIndex < contentsToSign.length) {
            response({
              success: true,
              contentToSign: contentsToSign[currentRequestedContentIndex]
            });
          } else {
            currentRequestedContentIndex = contentsToSign.length - 1;
            response({
              success: true,
              contentToSign: contentsToSign[contentsToSign.length - 1]
            });
          }
        } else {
          response({
            success: false
          });
        }
        break;
      case CANCEL_SIGNING:
        if(responseCallbacks.length > 0) {
          const responseCallback = responseCallbacks[currentRequestedContentIndex];
          responseCallback({
            success: false,
            ...msg.data
          });

          chrome.browserAction.getBadgeText({}, function(result) {
            const number = parseInt(result) - 1;
            chrome.browserAction.setBadgeText({text: number.toString()});
          });

          contentsToSign.splice(currentRequestedContentIndex, 1);
          responseCallbacks.splice(currentRequestedContentIndex, 1);
          if (contentsToSign.length === 0) {
            currentRequestedContentIndex = -1;
          }
        }
        break;
      case SKIP_SIGNING:
        currentRequestedContentIndex--;
        break;
      case SEND_SIGNED_DATA_BACK:
        if(responseCallbacks.length > 0) {
          const responseCallback = responseCallbacks[currentRequestedContentIndex];
          responseCallback({
            success: true,
            ...msg.data
          });

          chrome.browserAction.getBadgeText({}, function(result) {
            const number = parseInt(result) - 1;
            chrome.browserAction.setBadgeText({text: number.toString()});
          });

          contentsToSign.splice(currentRequestedContentIndex, 1);
          responseCallbacks.splice(currentRequestedContentIndex, 1);
          if (contentsToSign.length === 0) {
            currentRequestedContentIndex = -1;
          }
        }
        break;
      default:
        response(INVALID_REQUEST_RESPONSE);
        break;
    }
  });
}());
