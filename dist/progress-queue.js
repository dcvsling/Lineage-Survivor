/** Serialize this page's progress operations, including their in-memory state updates.
 * execute must read current save/memoryOnly inside its invocation, not before enqueue.
 * Each caller receives its own result/rejection; one failure does not poison the queue.
 */
export function createProgressQueue(execute){
  if(typeof execute!=='function')throw new TypeError('Progress queue requires an executor');
  let tail=Promise.resolve();
  return function enqueue(operation){
    const result=tail.then(()=>execute(operation));
    tail=result.then(()=>undefined,()=>undefined);
    return result;
  };
}
