import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { AppState } from 'src/app/core/store/app.state';
import { BackupResultModel } from 'src/app/core/models/backup-result.model';
import { BaseComponent } from '../../base.component';
import { ChromeMessageType } from 'src/app/core/enums/chrome-message-type';
import { ClearCreateDIDState } from 'src/app/core/store/create-did/create-did.actions';
import { ClearWorkflowState } from 'src/app/core/store/workflow/workflow.actions';
import { ConfirmModalComponent } from '../../modals/confirm-modal/confirm-modal.component';
import { CreateDIDState } from 'src/app/core/store/create-did/create-did.state';
import { DialogsService } from 'src/app/core/services/dialogs/dialogs.service';
import { DIDService } from 'src/app/core/services/did/did.service';
import { downloadFile } from 'src/app/core/utils/helpers';
import { ModalSizeTypes } from 'src/app/core/enums/modal-size-types';
import { PasswordDialogComponent } from '../../dialogs/password/password.dialog.component';
import { VaultService } from 'src/app/core/services/vault/vault.service';

@Component({
  selector: 'app-manage-dids',
  templateUrl: './manage-dids.component.html',
  styleUrls: ['./manage-dids.component.scss']
})
export class ManageDidsComponent extends BaseComponent implements OnInit {
  private subscription: Subscription;
  private createDIDState: CreateDIDState;
  public didIds: string[] = [];
  public displayedDidIds: string[] = [];
  public allDIDsPublicInfo: object;
  public formScreenOpen: boolean = false;
  public pageSize: number = 10;
  public didEditNickname: boolean[] = [];
  public currentPage: number = 1;
  public currentStartIndex = 0;

  constructor(
    private dialogsService: DialogsService,
    private didService: DIDService,
    private modalService: NgbModal,
    private router: Router,
    private store: Store<AppState>,
    private toastr: ToastrService,
    private vaultService: VaultService) {
      super();
    }

  ngOnInit() {
    chrome.tabs && chrome.tabs.getCurrent(function(tab) {
      if (tab === undefined) {
        chrome.runtime.sendMessage({type: ChromeMessageType.ManageDidsRequest}, (response) => {
          if (response.success) {
            const popup_url = chrome.runtime.getURL('index.html');
            chrome.tabs.create({'url': popup_url});
          }
        });
      } else {
        chrome.runtime.sendMessage({type: ChromeMessageType.CheckRequests}, (response) => {
          if (response.manageDidsRequested) {
            chrome.runtime.sendMessage({type: ChromeMessageType.NewTabOpen});
          }
        });
      }
    });

    this.getDIDsInfo();

    this.subscription = this.store
      .pipe(select(state => state.createDID))
      .subscribe(createDIDState => {
        this.createDIDState = createDIDState;
      });

    this.subscriptions.push(this.subscription);
  }

  backupDid(didId: string) {
    const dialogMessage = 'Enter your vault password to open the vault and encrypt your DID';

    this.dialogsService.open(PasswordDialogComponent, ModalSizeTypes.ExtraExtraLarge, dialogMessage)
      .subscribe((vaultPassword: string) => {
        if (vaultPassword) {
          this.vaultService
            .backupSingleDIDFromVault(didId, vaultPassword)
            .subscribe((result: BackupResultModel) => {
              if (result.success) {
                const date = new Date();
                const didBackupFile = this.postProcessDidBackupFile(result.backup, didId);
                downloadFile(didBackupFile, `paper-did-UTC--${date.toISOString()}.txt`);
              } else {
                this.toastr.error(result.message);
              }
            });
        }
      });
  }

  previewDid(didId: string) {
    this.didService.loadDIDForUpdate(didId);
    this.router.navigate([`dids/preview/${didId}`]);
  }

  editNickname(didId: string, nickname: string) {
    this.vaultService.updateDIDNickname(didId, nickname);
    this.allDIDsPublicInfo[didId].nickname = nickname;
    this.didEditNickname[didId] = false;
  }

  closeFormScreen() {
    if (this.createDIDState.managementKeys.length > 0
      || this.createDIDState.didKeys.length > 0
      || this.createDIDState.services.length > 0) {
        const confirmRef = this.modalService.open(ConfirmModalComponent);
        confirmRef.componentInstance.objectType = 'key';
        confirmRef.result.then((result) => {
          this.clearState();
        }).catch((error) => {
        });
    } else {
      this.clearState();
    }
  }

  search(searchTerm: string) {
    this.didIds = [];
    for (const didId in this.allDIDsPublicInfo) {
      if (this.allDIDsPublicInfo[didId].nickname.includes(searchTerm)) {
        this.didIds.push(didId);
      }
    }

    this.currentStartIndex = 0;
    this.currentPage = 1;
    this.displayedDidIds = this.didIds.slice(this.currentStartIndex, this.currentStartIndex + this.pageSize);
  }

  changePage (page) {
    this.currentPage = page;
    this.currentStartIndex = (this.currentPage - 1) * this.pageSize;
    this.displayedDidIds = this.didIds.slice(this.currentStartIndex, this.currentStartIndex + this.pageSize);
  }

  anyDID() {
    return Object.keys(this.allDIDsPublicInfo).length > 0;
  }

  copyDIDId(didId: string) {
    const selBox = document.createElement('textarea');
    selBox.style.position = 'fixed';
    selBox.style.left = '0';
    selBox.style.top = '0';
    selBox.style.opacity = '0';
    selBox.value = didId;
    document.body.appendChild(selBox);
    selBox.focus();
    selBox.select();
    document.execCommand('copy');
    document.body.removeChild(selBox);
  }

  private clearState() {
    this.formScreenOpen = false;
    this.getDIDsInfo();
    this.didService.clearData();
    this.store.dispatch(new ClearWorkflowState());
    this.store.dispatch(new ClearCreateDIDState());
    this.router.navigate(['dids/manage']);
  }

  private getDIDsInfo() {
    this.allDIDsPublicInfo = this.vaultService.getAllDIDsPublicInfo();
    this.didIds = Object.keys(this.allDIDsPublicInfo);
    this.displayedDidIds = this.didIds.slice(this.currentStartIndex, this.currentStartIndex + this.pageSize);
  }

  private postProcessDidBackupFile(encryptedFile: string, didId: string) {
    const parsedFile = JSON.parse(encryptedFile);
    const newKeysFile: any = { };

    newKeysFile.data = parsedFile.data;
    newKeysFile.encryptionAlgo = {
      name: 'AES-GCM',
      iv: parsedFile.iv,
      salt: parsedFile.salt,
      tagLength: 128
    };
    newKeysFile.did = didId;

    return JSON.stringify(newKeysFile, null, 2);
  }
}
