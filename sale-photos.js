const BUCKET='yard-sale-photos';
const MAX_PHOTOS=5;

export function setupPhotoPicker(input,preview,status,maxPhotos=MAX_PHOTOS) {
  let photos=[];
  let busy=false;
  const render=()=>{
    preview.replaceChildren();
    photos.forEach((photo,index)=>{
      const tile=document.createElement('div');tile.className='photo-preview';
      const img=document.createElement('img');img.src=photo.url;img.alt=`Selected photo ${index+1}`;
      const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label',`Remove photo ${index+1}`);
      button.onclick=()=>{URL.revokeObjectURL(photos[index].url);photos.splice(index,1);render();};
      tile.append(img,button);preview.append(tile);
    });
    status.textContent=photos.length?`${photos.length} of ${maxPhotos} available slots selected. Photos appear only after organizer approval.`:`Take photos or choose from your library. Up to ${maxPhotos} more; organizer approval required.`;
  };
  const handleChange=async()=>{
    const files=Array.from(input.files||[]);input.value='';
    if(photos.length+files.length>maxPhotos){status.textContent=`This sale has room for ${maxPhotos} more photos. Remove a preview to make room.`;return;}
    busy=true;input.disabled=true;status.textContent='Preparing photos…';
    try{
      for(const file of files){
        if(!file.type.startsWith('image/')||file.size>25*1024*1024)throw new Error('Choose an image smaller than 25 MB.');
        const blob=await compressPhoto(file);
        photos.push({blob,url:URL.createObjectURL(blob)});
      }
      render();
    }catch(error){render();status.textContent=error.message||'Could not open that photo. Try a JPEG or PNG, or take a new photo.';}
    finally{busy=false;input.disabled=false;}
  };
  input.addEventListener('change',handleChange);
  render();
  const reset=()=>{photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];render();};
  return {get files(){return photos.map(p=>p.blob);},get busy(){return busy;},reset,destroy(){input.removeEventListener('change',handleChange);reset();}};
}

async function compressPhoto(file){
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.8,.65,.5,.35]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=1048576)return blob;
    }
    throw new Error('That photo is too detailed to upload. Try a smaller photo.');
  }finally{URL.revokeObjectURL(url);}
}

export async function uploadSalePhotos(client,saleId,files,onProgress=()=>{}){
  if(files.length>5)throw new Error('A sale can have up to five photos.');
  const paths=[];
  try{
    for(let index=0;index<files.length;index++){
      onProgress(`Uploading photo ${index+1} of ${files.length}…`);
      const name=`${saleId}/${crypto.randomUUID()}.jpg`;
      const {error}=await client.storage.from(BUCKET).upload(name,files[index],{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
      if(error)throw error;paths.push(name);
    }
    if(paths.length){const {error}=await client.rpc('submit_sale_photos',{target_sale:saleId,paths});if(error)throw error;}
    return paths.length;
  }catch(error){
    // Reconcile a network failure after submission before removing uploaded files.
    const {data:reviews,error:lookupError}=await client.from('sale_photo_reviews').select('photo_paths').eq('sale_id',saleId);
    if(paths.length&&reviews?.some(review=>paths.every(path=>review.photo_paths.includes(path))))return paths.length;
    if(paths.length&&!lookupError)await client.storage.from(BUCKET).remove(paths);
    throw error;
  }
}

async function makeGallery(container,client,paths,label,addControls){
  if(!container.isConnected||!paths?.length)return;
  const {data,error}=await client.storage.from(BUCKET).createSignedUrls(paths,3600);
  if(!container.isConnected)return;
  if(error){container.textContent='Photos could not load. Please try again.';return;}
  const grid=document.createElement('div');grid.className='sale-photo-grid';
  for(const [index,item] of (data||[]).entries()){
    const tile=document.createElement('div');tile.className='sale-photo-tile';
    if(item.signedUrl){
      const link=document.createElement('a');link.href=item.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${label} ${index+1}, open full photo`);
      const img=document.createElement('img');img.src=item.signedUrl;img.alt=`${label} ${index+1}`;img.loading='lazy';link.append(img);tile.append(link);
    }else{const note=document.createElement('p');note.textContent='Photo unavailable';tile.append(note);}
    addControls?.(paths[index],tile,index);grid.append(tile);
  }
  container.replaceChildren(grid);
}

export async function renderSalePhotos(container,stop,client,isOrganizer=false,onChange=()=>{}){
  if(!stop.photo_paths?.length||!client)return;
  container.hidden=false;
  await makeGallery(container,client,stop.photo_paths,'Sale photo',isOrganizer?(path,tile,index)=>{
    const button=document.createElement('button');button.type='button';button.className='secondary remove-approved-photo';button.textContent='Remove photo';button.setAttribute('aria-label',`Remove approved photo ${index+1}`);
    const status=document.createElement('p');status.className='photo-action-status';status.setAttribute('role','status');tile.append(button,status);
    button.onclick=async()=>{
      if(!confirm('Remove this photo from the listing and permanently delete its stored file?'))return;
      button.disabled=true;status.textContent='Removing photo…';
      const {error:deleteError}=await client.storage.from(BUCKET).remove([path]);
      if(deleteError){status.textContent='Could not delete the photo. Please retry.';button.disabled=false;return;}
      const {error}=await client.rpc('remove_sale_photo',{target_sale:stop.id,target_path:path});
      if(error){status.textContent='The file was deleted. Retry to finish updating the listing.';button.disabled=false;return;}
      await onChange();
    };
  }:undefined);
}

export async function renderPhotoReview(container,stop,client,isOrganizer,onChange){
  if(!client||!container)return;
  const {data:reviews,error}=await client.from('sale_photo_reviews').select('*').eq('sale_id',stop.id).order('created_at');
  if(!container.isConnected||error||!reviews?.length)return;
  if(!isOrganizer){const pending=reviews.some(review=>review.status==='pending');container.textContent=pending?'Your photos are awaiting organizer approval.':reviews.every(review=>review.status==='rejected')?'Your photos were not approved for the public map.':'';return;}
  container.replaceChildren();
  for(const review of reviews){
    if(review.status!=='pending')continue;
    const batch=document.createElement('section');batch.className='photo-review-batch';container.append(batch);
    await renderPhotoReviewBatch(batch,review,client,onChange);
  }
}

async function renderPhotoReviewBatch(container,review,client,onChange){
  const pending=review.photo_paths.filter(path=>!(review.approved_paths||[]).includes(path)&&!(review.rejected_paths||[]).includes(path));
  if(!pending.length)return;
  const heading=document.createElement('h3');heading.textContent='Photos awaiting your approval';
  const note=document.createElement('p');note.textContent=`Submitted ${new Date(review.created_at).toLocaleString()}. Select the photos to approve or deny. Denied photos are deleted from storage.`;
  const selectAllLabel=document.createElement('label');selectAllLabel.className='photo-select-all';
  const selectAll=document.createElement('input');selectAll.type='checkbox';selectAllLabel.append(selectAll,document.createTextNode(' Select all photos'));
  const gallery=document.createElement('div');
  const actions=document.createElement('div');actions.className='detail-actions';
  const approve=document.createElement('button');approve.type='button';approve.className='primary';approve.textContent='Approve selected';
  const reject=document.createElement('button');reject.type='button';reject.className='secondary';reject.textContent='Deny selected';
  const status=document.createElement('p');status.setAttribute('role','status');
  const selected=new Set();const boxes=[];
  const sync=()=>{approve.disabled=reject.disabled=!selected.size;selectAll.checked=selected.size===pending.length;selectAll.indeterminate=selected.size>0&&selected.size<pending.length;status.textContent=`${selected.size} of ${pending.length} selected`;};
  actions.append(approve,reject);container.replaceChildren(heading,note,selectAllLabel,gallery,actions,status);
  await makeGallery(gallery,client,pending,'Private review photo',(path,tile,index)=>{
    const label=document.createElement('label');label.className='photo-select-label';const box=document.createElement('input');box.type='checkbox';box.setAttribute('aria-label',`Select photo ${index+1}`);
    box.onchange=()=>{if(box.checked)selected.add(path);else selected.delete(path);sync();};boxes.push({box,path});label.append(box,document.createTextNode(` Photo ${index+1}`));tile.append(label);
  });
  selectAll.onchange=()=>{for(const {box,path} of boxes){box.checked=selectAll.checked;if(selectAll.checked)selected.add(path);else selected.delete(path);}sync();};
  sync();
  const decide=async decision=>{
    if(!selected.size)return;
    approve.disabled=true;reject.disabled=true;status.textContent='Saving your decision…';
    const paths=Array.from(selected);
    if(decision==='rejected'){
      const {error}=await client.storage.from(BUCKET).remove(paths);
      if(error){status.textContent='Could not delete the selected photos. Nothing was denied; please retry.';approve.disabled=false;reject.disabled=false;return;}
    }
    const {error}=await client.rpc('review_selected_sale_photos',{target_review:review.id,paths,decision});
    if(error){status.textContent='Could not save your decision. Please sign in again and retry.';approve.disabled=false;reject.disabled=false;return;}
    await onChange();
  };
  approve.onclick=()=>decide('approved');reject.onclick=()=>decide('rejected');
}

export async function removeSalePhotos(client,saleId){
  const {data,error}=await client.storage.from(BUCKET).list(saleId,{limit:20});
  if(error)throw error;
  const paths=(data||[]).filter(item=>item.id).map(item=>`${saleId}/${item.name}`);
  if(paths.length){const {error}=await client.storage.from(BUCKET).remove(paths);if(error)throw error;}
}

export async function photoReviewCount(client){
  const {count,error}=await client.from('sale_photo_reviews').select('id',{count:'exact',head:true}).eq('status','pending');
  if(error)throw error;return count||0;
}

export async function openPhotoInbox(dialog,list,client,onSelect){
  list.textContent='Loading photo reviews…';dialog.showModal();
  const {data,error}=await client.from('sale_photo_reviews').select('id,sale_id,address,photo_paths').eq('status','pending').order('created_at');
  if(error){list.textContent='Could not load reviews. Please sign in again and retry.';return;}
  list.replaceChildren();
  if(!data?.length){list.textContent='All caught up. No photos are waiting for approval.';return;}
  for(const review of data){const button=document.createElement('button');button.type='button';button.className='secondary photo-inbox-row';button.textContent=`${review.address} · review photos`;button.onclick=()=>{dialog.close();onSelect(review.sale_id);};list.append(button);}
}
