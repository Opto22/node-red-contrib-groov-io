import * as fs from 'fs';
import * as should from 'should';
import * as assert from 'assert';
import * as Promise from 'bluebird';
import * as http from 'http';
import * as async from 'async';
import * as ApiLib from "../src/swagger/lib/api";
import { ClientTestUtil } from './test-util/client-test-util';
import { RackInfo } from './test-util/rack-info';

interface PromiseResponse {
    response: http.ClientResponse;
    body: any; // Since we don't do anything much with the response bodies, we can ignore the type.
}

describe('Configure I/O', function () {

    before(function (beforeDone: MochaDone) {
        ClientTestUtil.init(
            (error: any, clientInfo?: { publicCertFile: Buffer, sharedApiClient: ApiLib.DefaultApi }) => {
                if (error)
                    assert.fail(error.toString());
                else {
                    beforeDone();
                }
            });
    });

    it('Configure Analog Input Modules', function (done) {
        this.timeout(5000);
        async.times(RackInfo.ai.numChannels,
            (n: number, next: (err?: any) => void) => {
                ClientTestUtil.sharedApiClient.setChannelConfiguration('local', RackInfo.ai.index, n,
                    {
                        name: 'nodeRedGrvIo[6][' + n + ']',
                        channelType: '0x60000017', // ±10 V
                        simpleMovingAverageReadings: 1
                    }).then(
                        (fullfilledResponse: PromiseResponse) => {
                            next();
                        },
                        next
                    );
            },
            done
        );
    });

    it('Configure Analog Output Modules', function (done) {
        async.times(RackInfo.ao.numChannels,
            (n: number, next: (err?: any) => void) => {
                ClientTestUtil.sharedApiClient.setChannelConfiguration('local', RackInfo.ao.index, n,
                    {
                        name: 'nodeRedGrvIo[7][' + n + ']',
                        channelType: '0xA000001F', // ±10 V
                    }
                ).then((fullfilledResponse: PromiseResponse) => {
                    next();
                },
                    next
                );
            },
            done
        );
    });

    it('Reset all digital output values', function (done) {
        async.times(RackInfo.do.numChannels,
            (n: number, next: (err?: any) => void) => {
                ClientTestUtil.sharedApiClient.setDigitalChannelState('local', RackInfo.do.index, n, { value: false })
                    .then((fullfilledResponse: PromiseResponse) => {
                        next();
                    },
                        next
                    );
            },
            done
        );
    });


    it('Reset all analog output values', function (done) {
        async.times(8,
            (n: number, next: (err?: any) => void) => {
                ClientTestUtil.sharedApiClient.setAnalogChannelValue('local', RackInfo.ao.index, n, { value: 0 })
                    .then((fullfilledResponse: PromiseResponse) => {
                        next();
                    },
                        next
                    );
            },
            done
        );
    });

});
