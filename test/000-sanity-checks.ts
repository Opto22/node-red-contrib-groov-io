import * as fs from 'fs';
import * as should from 'should';
import * as assert from 'assert';
import * as Promise from 'bluebird';
import * as http from 'http';
import async = require('async');
import * as ApiLib from "../src/swagger/lib/api";
import { ClientTestUtil } from './test-util/client-test-util';
import { visitFunctionBody } from 'typescript';
import { RackInfo } from './test-util/rack-info';

interface PromiseResponse {
    response: http.ClientResponse;
    body: any; // Since we don't do anything much with the response bodies, we can ignore the type.
}

describe('sanity checks', function () {

    before(function (beforeDone: MochaDone) {
        ClientTestUtil.init(
            (error: any, clientInfo?: { publicCertFile: Buffer, sharedApiClient: ApiLib.DefaultApi }) => {
                if (error)
                    assert.fail(JSON.stringify(error));
                else {
                    beforeDone();
                }
            });
    });

    // it('getapikey', function (done) {
    //     ClientTestUtil.getApiKey('a', 'a').then(
    //         (fullfilledResponse: PromiseResponse) => {
    //             console.log('fullfilledResponse.body = ' + JSON.stringify(fullfilledResponse.body, undefined, 2));

    //             ClientTestUtil.getPublicCert().then(
    //                 (fullfilledResponse: PromiseResponse) => {
    //                     console.log('fullfilledResponse.body = ' + JSON.stringify(fullfilledResponse.body, undefined, 2));
    //                     done();
    //                 },
    //                 (error: any) => {
    //                     console.log('error = ' + JSON.stringify(error));
    //                     done(error);
    //                 }
    //             );
    //         },
    //         (error: any) => {
    //             console.log('error = ' + JSON.stringify(error));
    //             done(error);
    //         }
    //     );
    // });

    it('Test device is a GRV-EPIC-PR1', function (done) {
        ClientTestUtil.sharedApiClient.getIoInfo('local').then(
            (fullfilledResponse: PromiseResponse) => {
                should(fullfilledResponse.body).property('hardware').property('part').equal('GRV-EPIC-PR1');
                done();
            },
            (error: any) => {
                console.log('error = ' + JSON.stringify(error));
                done(error);
            }
        );
    });

    it('Test device has the required modules', function (done) {
        ClientTestUtil.sharedApiClient.getModuleInfos('local').then(
            (fullfilledResponse: PromiseResponse) => {
                const modules = fullfilledResponse.body.modules;
                should(modules[RackInfo.di.index].moduleId).eql(RackInfo.di.id); // GRV-IAC-24
                should(modules[RackInfo.do.index].moduleId).eql(RackInfo.do.id); // GRV-OAC-12
                should(modules[RackInfo.ai.index].moduleId).eql(RackInfo.ai.id); // GRV-IV-24
                should(modules[RackInfo.ao.index].moduleId).eql(RackInfo.ao.id); // GRV-OVMALC-8
                done();
            },
            (error: any) => {
                console.log('error = ' + JSON.stringify(error));
                done(error);
            }
        );
    });
});
6