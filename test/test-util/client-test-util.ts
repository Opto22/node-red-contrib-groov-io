import localVarRequest = require('request');
import http = require('http');
import https = require('https');
import * as fs from 'fs';
import * as path from 'path';
import * as Promise from 'bluebird';
import * as ApiLib from "../../src/swagger/lib/api";
import { updateShorthandPropertyAssignment } from 'typescript';
import { nextTick } from 'async';

interface PromiseResponse {
    response: http.ClientResponse;
    body: any; // Since we don't do anything much with the response bodies, we can ignore the type.
}

var TestSettings = require('../settings.json');

export class UserFullData {
    username: string;
    apiKey: string;
    email: string;
    isAdmin: boolean;
    sessionExpires: boolean;
    canLogout: boolean;
    requirePasswordReset: boolean;
    manageAppPermission: string;
    groovAppPermission: string;
    nodeRedPermission: string;
    pacRestApiPermission: string;
    secureMmpApiPermission: string;
    dbId?: string;
    rowId?: number;
    sessions?: Array<any>;
    pwdHash?: string;
}


export class ClientTestUtil {
    static sharedApiClient: ApiLib.DefaultApi | undefined;
    static publicCertFile ;
    static caCertFile: Buffer;
    static caCertPath: string;
    static userData: UserFullData | undefined;


    static init(cb: (error?: any) => void) {

        if (ClientTestUtil.sharedApiClient) {
            nextTick(cb);
        }
        else {
            ClientTestUtil.createClient((error: any, clientInfo?: { certFile: Buffer, apiClient: ApiLib.DefaultApi, userData: UserFullData }) => {

                if (error) {
                    cb(error);
                    return;
                }

                if (clientInfo) {
                    ClientTestUtil.sharedApiClient = clientInfo.apiClient;
                    ClientTestUtil.caCertFile = clientInfo.certFile;
                    ClientTestUtil.userData = clientInfo.userData;

                    // Also need to write out the file. The node will want to read 
                    // it itself.
                    ClientTestUtil.caCertPath = path.join(process.cwd(),'temp', 'caCertFile.pem');

                    fs.writeFileSync(ClientTestUtil.caCertPath, clientInfo.certFile, 'utf8');
                }

                cb();
            });
        }
    }

    static createClient(cb: (error: any, clientInfo?: { certFile: Buffer, apiClient: ApiLib.DefaultApi, userData: UserFullData }) => void) {

        ClientTestUtil.getApiKey(TestSettings.groovUsername, TestSettings.groovPassword).then(
            (fullfilledResponse: PromiseResponse) => {

                var userData: UserFullData = fullfilledResponse.body;

                ClientTestUtil.getCert(userData).then(
                    (fullfilledResponse: PromiseResponse) => {
                        var certInfo = JSON.parse(fullfilledResponse.body);

                        // console.log('fullfilledResponse.body = ' + JSON.stringify(fullfilledResponse.body, undefined, 2));

                        var certFile = Buffer.from(certInfo.encoded);

                        var client = new ApiLib.DefaultApi(TestSettings.groovAddress,
                            userData.apiKey, undefined, certFile);

                        cb(undefined, {
                            certFile: certFile,
                            apiClient: client,
                            userData: userData
                        });
                    },
                    (error: any) => {
                        // console.log('error = ' + JSON.stringify(error));
                        cb(error);
                    }
                );
            },
            (error: any) => {
                // console.log('error = ' + JSON.stringify(error));
                cb(error);
            }
        );
    }

    static getApiKey(username: string, password: string):
        Promise<{ response: http.ClientResponse; body: UserFullData }> {

        let localVarRequestOptions: localVarRequest.Options = {
            method: 'POST',
            qs: {},
            headers: {},
            uri: 'https://' + TestSettings.groovAddress + '/auth/access/user/login',
            useQuerystring: false,
            json: true,
            body: {
                username: username,
                password: password
            }
        };

        // We don't have the certificates yet, so don't freak out about HTTPS.
        (<https.ServerOptions>localVarRequestOptions).rejectUnauthorized = false;

        localVarRequestOptions.forever = true;
        // localVarRequestOptions.agent = this.httpsAgent;
        localVarRequestOptions.timeout = 15000;

        return new Promise<{ response: http.ClientResponse; body: UserFullData; }>((resolve, reject) => {
            localVarRequest(localVarRequestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {
                        resolve({ response: response, body: body });
                    } else {
                        reject({ response: response, body: body });
                    }
                }
            });
        });
    }

    static getCert(userData: UserFullData):
        Promise<{ response: http.ClientResponse; body: any }> {

        let localVarRequestOptions: localVarRequest.Options = {
            method: 'GET',
            qs: {},
            headers: {
                apiKey: userData.apiKey
            },
            uri: 'https://' + TestSettings.groovAddress + '/manage/api/v1/ssl/view',
            useQuerystring: false
        };

        // We don't have the certificates yet, so don't freak out about HTTPS.
        (<https.ServerOptions>localVarRequestOptions).rejectUnauthorized = false;

        localVarRequestOptions.forever = true;
        // localVarRequestOptions.agent = this.httpsAgent;
        localVarRequestOptions.timeout = 15000;

        return new Promise<{ response: http.ClientResponse; body: any; }>((resolve, reject) => {
            localVarRequest(localVarRequestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {

                        resolve({ response: response, body: body });
                    } else {
                        reject({ response: response, body: body });
                    }
                }
            });
        });
    }
}