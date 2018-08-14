const shim = require('fabric-shim');
const ClientIdentity = require('fabric-shim').ClientIdentity;

const logger = shim.newLogger('StorageChaincode');

module.exports = class StorageChaincode {
  constructor() {
    this.logger = shim.newLogger(this.constructor.name);
  }

  async Init(stub) {
    this.stub = stub;

    let req = stub.getFunctionAndParameters();
    logger.info("Init on %s with %j", stub.getChannelID(), req);
    return shim.success(Buffer.from(''));
  }

  async Invoke(stub) {
    this.stub = stub;

    let req = stub.getFunctionAndParameters();
    this.channel = stub.getChannelID();

    // use either methods to get transaction creator org and identity
    let cid = new ClientIdentity(stub);
    // logger.info("by %s %s %j", cid.mspId, cid.id, cid.cert);
    // this.creator = stub.getCreator();
    // logger.info("by %s", this.creator.mspid);
    this.creator = cid;
    this.creator.org = cid.mspId.split('MSP')[0];

    logger.info("Invoke on %s by %s with %j", this.channel, this.creator.org, req);

    let method = this[req.fcn];
    if (!method) {
      return shim.error(`no method found of name: ${req.fcn}`);
    }

    method = method.bind(this);

    try {
      let ret = await method(req.params);

      /*let ret;
      if(req.fcn === 'put') {
        ret = await this.put(req.params);
      }
      else if(req.fcn === 'get') {
        ret = await this.get(req.params);
      }
      else if(req.fcn === 'delete') {
        ret = await this.delete(req.params);
      }
      else if(req.fcn === 'list') {
        ret = await this.list(req.params);
      }
      else if(req.fcn === 'range') {
        ret = await this.range(req.params);
      }*/

      return shim.success(ret);
    } catch (err) {
      logger.error(err);
      return shim.error(err);
    }
  }

  async get(args) {
    let key = toKey(this.stub, args);

    logger.debug('get args=%j key=%s', args, key);

    return await this.stub.getState(key);
  }

  async put(args) {
    let req = toKeyValue(this.stub, args);

    logger.debug('put args=%j key=%s', args, req.key);

    await this.stub.putState(req.key, Buffer.from(req.value));
  }

  async range(args) {
    let startKey = '', endKey = '';
    if(args.length > 0){
      startKey = args[0];
    }
    if(args.length > 1) {
      endKey = args[1];
    }

    let iter = await this.stub.getStateByRange(startKey, endKey);

    return await toQueryResult(iter);
  }

  async list(args) {
    if(args.length < 1) {
      throw new Error('incorrect number of arguments, objectType is required');
    }

    let objectType = args[0];
    let attributes = args.slice(1);

    logger.debug('list args=%j objectType=%j, attributes=%j', args, objectType, attributes);

    let iter = await this.stub.getStateByPartialCompositeKey(objectType, attributes);

    return await toQueryResult(iter);
  }

  async delete(args) {
    let key = toKey(this.stub, args);

    logger.debug('delete args=%j key=%s', args, key);

    await this.stub.deleteState(key)
  }

  async invokeChaincode(chaincode, args, channel) {
    let invokeArgs = [];
    args.forEach(a => {
      invokeArgs.push(Buffer.from(a));
    });

    logger.debug('invokeChaincode chaincode=%s channel=%s args=%j invokeArgs=%j', chaincode, channel, args, invokeArgs);

    return this.stub.invokeChaincode(chaincode, invokeArgs, channel);
  }

  setEvent(name, args) {
    let eventArgs = Buffer.from(JSON.stringify(args));

    logger.debug('setEvent name=%s args=%j eventArgs=%j', name, args, eventArgs);

    this.stub.setEvent(name, eventArgs);
  }
};

async function toQueryResult(iter) {
  let ret = [];
  while(true) {
    let res = await iter.next();

    if(res.value && res.value.value.toString()) {
      let jsonRes = {};

      jsonRes.key = res.value.key;
      try {
        jsonRes.value = JSON.parse(res.value.value.toString('utf8'));
      } catch (err) {
        jsonRes.value = res.value.value.toString('utf8');
      }
      ret.push(jsonRes);
    }

    if(res.done) {
      await iter.close();
      return Buffer.from(JSON.stringify(ret));
    }
  }
}

function toKey(stub, args) {
  let k;
  if(args.length < 1) {
    throw new Error('incorrect number of arguments, key is required');
  }
  else if(args.length === 1) {
    k = args[0];
  }
  else if(args.length > 1) {
    let objectType = args[0];
    let attributes = args.slice(1);

    k = stub.createCompositeKey(objectType, attributes);
  }

  return k;
}

function toKeyValue(stub, args) {
  let k, v;
  if(args.length < 2) {
    throw new Error('incorrect number of arguments, key and value are required');
  }
  else if(args.length === 2) {
    k = args[0];
    v = args[1];
  }
  else if(args.length > 2) {
    let objectType = args[0];
    let attributes = args.slice(1, args.length-1);

    k = stub.createCompositeKey(objectType, attributes);
    v = args[args.length-1];
  }

  return {key: k, value: v};
}