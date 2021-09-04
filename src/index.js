const md5 = require('MD5')
const axios = require('axios')
const helpers = require('./utils/helpers')
const getRawBody = require('raw-body')
const {promisify} = require('util')
const XMLParser = require('xml2js').Parser
const request = require('request-promise')

const xmlParser = new XMLParser({
  explicitArray: false,
  ignoreAttrs: true
})

module.exports = class {
  constructor ({appid, mch_id, key} = {}) {
    this.appid = appid
    this.mch_id = mch_id
    this.key = key
  }

  sign (params) {
    const querystring = Object.keys(params).filter(key => !!params[key] && key !== 'key').sort().map(key => `${key}=${params[key]}`).join('&') + '&key=' + params.key
    return md5(querystring).toUpperCase()
  }

  async createUnifiedOrder (options = {}) {
    const {appid, mch_id, key} = this
    const nonce_str = helpers.getNonceString(32)
    const sign_type = 'MD5'

    if (!options['trade_type']) {
      options['trade_type'] = 'JSAPI'
    }

    const postData = {
      appid: options.appid || appid,
      mch_id,
      nonce_str,
      sign_type,
      ...options
    }
    const sign = this.sign({key, ...postData})
    const {data} = await axios.request({
      method: 'POST',
      url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
      data: helpers.buildXML({sign, ...postData})
    })
    const unifiedOrder = await helpers.parseXML(data)

    if (options['trade_type'] === 'JSAPI') {
      const paymentParams = {
        timeStamp: helpers.getTimeStamp(),
        nonceStr: nonce_str,
        package: `prepay_id=${unifiedOrder.prepay_id}`,
        signType: 'MD5'
      }

      return {
        paySign: this.sign({key, appId: this.appid, ...paymentParams}),
        ...paymentParams,
        unifiedOrder
      }
    } else {
      const paymentParams = {
        timestamp: helpers.getTimeStamp(),
        noncestr: nonce_str,
        prepayid: unifiedOrder.prepay_id,
        package: `Sign=WXPay`
      }

      return {
        appid,
        partnerid: mch_id,
        ...paymentParams,
        sign: this.sign({
          key,
          appid: this.appid,
          partnerid: mch_id,
          ...paymentParams
        }),
        unifiedOrder
      }
    }
  }

  async transfer (agentOptions, options = {}) {
    const {appid, mch_id, key} = this
    const nonce_str = helpers.getNonceString(32)
    const check_name = 'NO_CHECK'
    const postData = {
      mch_appid: appid,
      mchid: mch_id,
      nonce_str,
      check_name,
      ...options
    }
    const sign = this.sign({key, ...postData})
    const data = await request({
      method: 'POST',
      url: 'https://api.mch.weixin.qq.com/mmpaymkttransfers/promotion/transfers',
      body: helpers.buildXML({sign, ...postData}),
      agentOptions
    })
    return helpers.parseXML(data)
  }

  async parseXml (req) {
    const {xml} = await promisify(xmlParser.parseString)(
      await getRawBody(req)
    )
    return xml
  }
}
