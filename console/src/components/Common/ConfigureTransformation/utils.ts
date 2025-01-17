import { RequestTransform, RequestTransformMethod } from '@/metadata/types';
import { getLSItem, LS_KEYS } from '@/utils/localStorage';
import {
  GraphiQlHeader,
  KeyValuePair,
  RequestTransformState,
} from './stateDefaults';
import { isJsonString } from '../utils/jsUtils';
import { Nullable } from '../utils/tsUtils';

export const getPairsObjFromArray = (pairs: KeyValuePair[]) => {
  let obj = {};

  pairs.forEach(({ name, value }) => {
    if (!!name && !!value) {
      const pair = { [name]: value };
      obj = { ...obj, ...pair };
    }
  });

  return obj;
};

export const addPlaceholderValue = (pairs: KeyValuePair[]) => {
  if (pairs.length) {
    const lastVal = pairs[pairs.length - 1];
    if (lastVal.name && lastVal.value) {
      pairs.push({ name: '', value: '' });
    }
  } else {
    pairs.push({ name: '', value: '' });
  }
  return pairs;
};

export const getArrayFromServerPairObject = (
  pairs: Nullable<Record<string, string>>
): KeyValuePair[] => {
  const transformArray: KeyValuePair[] = [];
  if (pairs && Object.keys(pairs).length !== 0) {
    Object.entries(pairs).forEach(([key, value]) => {
      transformArray.push({ name: key, value });
    });
  }
  transformArray.push({ name: '', value: '' });
  return transformArray;
};

export const checkEmptyString = (val?: string) => {
  return val && val !== '' ? val : undefined;
};

export const getRequestTransformObject = (
  transformState: RequestTransformState
) => {
  const isRequestUrlTransform = transformState.isRequestUrlTransform;
  const isRequestPayloadTransform = transformState.isRequestPayloadTransform;

  if (!isRequestUrlTransform && !isRequestPayloadTransform) return null;

  let obj: RequestTransform = {
    template_engine: transformState.templatingEngine,
  };

  if (isRequestUrlTransform) {
    obj = {
      ...obj,
      method: transformState.requestMethod,
      url: checkEmptyString(transformState.requestUrl),
      query_params: getPairsObjFromArray(transformState.requestQueryParams),
    };
  }

  if (isRequestPayloadTransform) {
    obj = {
      ...obj,
      body: checkEmptyString(transformState.requestBody),
      content_type: transformState.requestContentType,
    };
  }

  return obj;
};

const getErrorFromCode = (data: Record<string, any>) => {
  const errorCode = data.code ? data.code : '';
  const errorMsg = data.error ? data.error : '';
  return `${errorCode}: ${errorMsg}`;
};

const getErrorFromBody = (data: Record<string, any>) => {
  const errorObj = data.body[0];
  const errorCode = errorObj?.error_code;
  const errorMsg = errorObj?.message;
  const stPos = errorObj?.source_position?.start_line
    ? `, starts line ${errorObj?.source_position?.start_line}, column ${errorObj?.source_position?.start_column}`
    : ``;
  const endPos = errorObj?.source_position?.end_line
    ? `, ends line ${errorObj?.source_position?.end_line}, column ${errorObj?.source_position?.end_column}`
    : ``;
  return `${errorCode}: ${errorMsg} ${stPos} ${endPos}`;
};

export const parseValidateApiData = (
  requestData: Record<string, any>,
  setError: (error: string) => void,
  setUrl?: (data: string) => void,
  setBody?: (data: string) => void
) => {
  if (requestData?.code) {
    const errorMessage = getErrorFromCode(requestData);
    setError(errorMessage);
  } else if (requestData?.body?.[0]?.error_code) {
    const errorMessage = getErrorFromBody(requestData);
    setError(errorMessage);
  } else if (requestData?.webhook_url || requestData?.body) {
    if (setUrl && requestData?.webhook_url) {
      setUrl(requestData?.webhook_url);
    }
    if (setBody && requestData?.body) {
      setBody(JSON.stringify(requestData?.body, null, 2));
    }
  } else {
    console.error(requestData);
  }
};

type RequestTransformer = {
  body?: string;
  url?: string;
  method?: Nullable<RequestTransformMethod>;
  query_params?: Record<string, string>;
  template_engine?: string;
};

const getTransformer = (
  transformerBody?: string,
  transformerUrl?: string,
  requestMethod?: Nullable<RequestTransformMethod>,
  queryParams?: KeyValuePair[]
): RequestTransformer => {
  return {
    body: checkEmptyString(transformerBody),
    url: checkEmptyString(transformerUrl),
    method: requestMethod,
    query_params: queryParams ? getPairsObjFromArray(queryParams) : undefined,
    template_engine: 'Kriti',
  };
};

const generateValidateTransformQuery = (
  transformer: RequestTransformer,
  requestPayload: Nullable<Record<string, any>> = null,
  webhookUrl: string,
  sessionVars?: KeyValuePair[]
) => {
  return {
    type: 'test_webhook_transform',
    args: {
      webhook_url: webhookUrl,
      body: requestPayload,
      session_variables: sessionVars
        ? getPairsObjFromArray(sessionVars)
        : undefined,
      request_transform: transformer,
    },
  };
};

const getSessionVarsArray = () => {
  const lsHeadersString =
    getLSItem(LS_KEYS.apiExplorerConsoleGraphQLHeaders) ?? '';
  const headers: GraphiQlHeader[] = isJsonString(lsHeadersString)
    ? JSON.parse(lsHeadersString)
    : [];
  let sessionVars: KeyValuePair[] = [];
  if (Array.isArray(headers)) {
    sessionVars = headers
      .filter(
        (header: GraphiQlHeader) =>
          header.isActive && header.key.toLowerCase().startsWith('x-hasura')
      )
      .map((header: GraphiQlHeader) => ({
        name: header.key,
        value: header.value,
      }));
  }
  return sessionVars;
};

export const getValidateTransformOptions = (
  inputPayloadString: string,
  webhookUrl: string,
  transformerBody?: string,
  transformerUrl?: string,
  queryParams?: KeyValuePair[],
  requestMethod?: Nullable<RequestTransformMethod>
) => {
  const sessionVars = getSessionVarsArray();

  const requestPayload = isJsonString(inputPayloadString)
    ? JSON.parse(inputPayloadString)
    : null;

  const finalReqBody = generateValidateTransformQuery(
    getTransformer(transformerBody, transformerUrl, requestMethod, queryParams),
    requestPayload,
    webhookUrl,
    sessionVars
  );

  const options: RequestInit = {
    method: 'POST',
    body: JSON.stringify(finalReqBody),
  };

  return options;
};

const getWordListArray = (mainObj: Record<string, any>) => {
  const uniqueWords = new Set<string>();
  const recursivelyWalkObj = (obj: Record<string, any>) => {
    if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof key === 'string') {
          uniqueWords.add(key);
        }
        if (typeof value === 'string') {
          uniqueWords.add(value);
        }
        if (typeof value === 'object' && value != null) {
          recursivelyWalkObj(value);
        }
      });
    }
  };
  recursivelyWalkObj(mainObj);
  return Array.from(uniqueWords);
};

export const getAceCompleterFromString = (jsonString: string) => {
  const jsonObject = isJsonString(jsonString) ? JSON.parse(jsonString) : {};
  const wordListArray = getWordListArray(jsonObject);

  const wordCompleter = {
    getCompletions: (
      editor: any,
      session: any,
      pos: any,
      prefix: string,
      callback: (
        arg1: Nullable<string>,
        arg2: { caption: string; value: string; meta: string }[]
      ) => void
    ) => {
      if (prefix.length === 0) {
        callback(null, []);
        return;
      }
      callback(
        null,
        wordListArray.map(word => {
          return {
            caption: word,
            value: word,
            meta: 'Sample Input',
          };
        })
      );
    },
  };
  return wordCompleter;
};

export const sidebarNumberStyles =
  '-mb-9 -ml-14 bg-gray-50 text-sm font-medium border border-gray-400 rounded-full flex items-center justify-center h-lg w-lg';

export const inputStyles =
  'block h-10 shadow-sm rounded border-gray-300 hover:border-gray-400 focus:ring-2 focus:ring-yellow-200 focus:border-yellow-400';

export const buttonShadow =
  'bg-gray-50 bg-gradient-to-t from-transparent to-white border border-gray-300 rounded shadow-xs hover:border-gray-400';

export const focusYellowRing =
  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400';

export const editorDebounceTime = 1000;
